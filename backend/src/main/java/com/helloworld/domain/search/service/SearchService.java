package com.helloworld.domain.search.service;

import com.helloworld.domain.search.dto.response.PostSearchResponse;
import com.helloworld.domain.search.dto.response.RecentSearchResponse;
import com.helloworld.domain.search.dto.response.SearchAllResponse;
import com.helloworld.domain.search.entity.SearchType;
import com.helloworld.domain.search.mapper.SearchMapper;
import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 검색 비즈니스 로직 (서비스 계층). 트랜잭션 경계는 이 계층에만 둔다.
 * 통합/카테고리 검색 + 최근 검색어(search_histories) 조회·삭제를 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SearchService {

    /** 최근 검색어 반환 개수 상한 (과대 요청 방지). */
    private static final int MAX_RECENT_LIMIT = 20;
    /** 검색어 최소 길이 (기능명세 1자 vs API 2자 → API 기준). */
    private static final int MIN_KEYWORD_LENGTH = 2;
    /** 단일 범주 검색 페이지 크기 상한. */
    private static final int MAX_SEARCH_SIZE = 50;
    /** ALL 검색 시 범주별 미리보기 개수. */
    private static final int ALL_PREVIEW_SIZE = 3;
    /** 유저당 보관하는 최근 검색어 최대 개수. */
    private static final int MAX_STORED_HISTORY = 10;

    private final SearchMapper searchMapper;

    /**
     * 통합/카테고리 검색. 로그인 필수(컨트롤러 @LoginUserId).
     * type=ALL이면 범주별 상위 N건 그룹, 단일 범주면 CursorResponse.
     *
     * @param loginUserId 로그인 사용자 id (검색어 자동저장 슬라이스에서 사용 예정)
     * @param keyword     검색어(널/빈값·2자 미만이면 예외)
     * @param typeRaw     ALL/USER/POST/TECH_STACK (기본 ALL)
     * @param cursor      단일 범주 커서(직전 마지막 id)
     * @param size        단일 범주 페이지 크기([1, MAX_SEARCH_SIZE]로 보정)
     */
    @Transactional(readOnly = true)
    public Object search(Long loginUserId, String keyword, String typeRaw, Long cursor, int size) {
        String kw = validateKeyword(keyword);
        SearchType type = SearchType.from(typeRaw);
        int safeSize = Math.min(Math.max(size, 1), MAX_SEARCH_SIZE);

        return switch (type) {
            case USER -> CursorResponse.of(
                    fetchUsers(kw, cursor, safeSize + 1), safeSize, UserSummaryResponse::getUserId);
            case POST -> CursorResponse.of(
                    fetchPostsByContent(kw, cursor, safeSize + 1), safeSize, PostSearchResponse::getPostId);
            case TECH_STACK -> CursorResponse.of(
                    fetchPostsByTechStack(kw, cursor, safeSize + 1), safeSize, PostSearchResponse::getPostId);
            case ALL -> SearchAllResponse.of(
                    fetchUsers(kw, null, ALL_PREVIEW_SIZE),
                    fetchPostsByContent(kw, null, ALL_PREVIEW_SIZE),
                    fetchPostsByTechStack(kw, null, ALL_PREVIEW_SIZE));
        };
    }

    /**
     * 검색어 자동저장(best-effort, 비동기). 검색 실행 후 컨트롤러가 호출한다.
     * UPSERT(같은 keyword+type이면 최신화)로 중복을 원자적으로 흡수하고, 유저당 최대 10개만 남긴다.
     * 별도 스레드·트랜잭션에서 돌며 실패해도 검색 응답에는 영향 없다(로그만).
     *
     * @param userId     로그인 사용자 id
     * @param rawKeyword 원본 검색어
     * @param rawType    ALL/USER/POST/TECH_STACK
     */
    @Async
    @Transactional
    public void recordSearch(Long userId, String rawKeyword, String rawType) {
        String keyword = normalizeKeywordOrNull(rawKeyword); // 정상 경로에선 이미 검증됨. 방어적으로 한 번 더.
        if (keyword == null) {
            return;
        }
        try {
            String type = SearchType.from(rawType).name();
            // INSERT ... ON DUPLICATE KEY UPDATE: 신규면 1, 갱신이면 2 반환.
            int inserted = searchMapper.upsertHistory(userId, keyword, type);
            if (inserted == 1) {
                // 새 행이 늘어난 경우에만 정리(갱신은 개수 불변이라 prune 불필요)
                searchMapper.pruneHistory(userId, MAX_STORED_HISTORY);
            }
        } catch (DataAccessException e) {
            // 자동저장은 부가 기능 — DB 오류로 실패해도 검색 자체엔 영향 없다(로그만).
            // 그 외 예외(프로그래밍 오류)는 삼키지 않고 비동기 핸들러로 전파돼 드러나게 둔다.
            log.warn("검색어 자동저장 실패: userId={}, keyword={}", userId, keyword, e);
        }
    }

    /** 검색 가능한 키워드면 trim한 값, 아니면 null(널·빈값·최소 길이 미만). */
    private String normalizeKeywordOrNull(String keyword) {
        if (keyword == null) {
            return null;
        }
        String trimmed = keyword.trim();
        return trimmed.length() < MIN_KEYWORD_LENGTH ? null : trimmed;
    }

    /* 범주별 조회 — 이스케이프·정제를 한곳에 모아 ALL·단일 범주가 공유한다. */

    private List<UserSummaryResponse> fetchUsers(String kw, Long cursor, int limit) {
        return searchMapper.searchUsers(likeEscape(kw), cursor, limit);
    }

    private List<PostSearchResponse> fetchPostsByContent(String kw, Long cursor, int limit) {
        String cleaned = stripBooleanOperators(kw);
        if (cleaned.isBlank()) {
            // 연산자만 남아 검색할 토큰이 없음 → 조회 없이 빈 결과(오해 없게 명시적으로)
            return List.of();
        }
        return searchMapper.searchPostsByContent("\"" + cleaned + "\"", cursor, limit);
    }

    private List<PostSearchResponse> fetchPostsByTechStack(String kw, Long cursor, int limit) {
        return searchMapper.searchPostsByTechStack(likeEscape(kw), cursor, limit);
    }

    /** 검색어 검증: 널/빈값 → EMPTY, 2자 미만 → TOO_SHORT. 양끝 공백 제거해 반환. */
    private String validateKeyword(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            throw new BusinessException(ErrorCode.SEARCH_EMPTY_KEYWORD);
        }
        String trimmed = keyword.trim();
        if (trimmed.length() < MIN_KEYWORD_LENGTH) {
            throw new BusinessException(ErrorCode.SEARCH_KEYWORD_TOO_SHORT);
        }
        return trimmed;
    }

    /** LIKE 와일드카드(%,_)·이스케이프 문자(\)를 리터럴로. ESCAPE '\\' 와 짝(nickname·tag용). */
    private String likeEscape(String kw) {
        return kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** ngram BOOLEAN MODE용 연산자 제거(따옴표 구로 감싸기 전 단계). content용. */
    private String stripBooleanOperators(String kw) {
        return kw.replaceAll("[+\\-><()~*\"@]", " ").trim();
    }

    /**
     * 최근 검색어 최신순 조회.
     *
     * @param userId 로그인 사용자 id (인증 필수)
     * @param limit  요청 개수 ([1, MAX_RECENT_LIMIT]로 보정)
     */
    @Transactional(readOnly = true)
    public List<RecentSearchResponse> getRecentSearches(Long userId, int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), MAX_RECENT_LIMIT);
        return searchMapper.selectRecentByUser(userId, safeLimit);
    }

    /**
     * 최근 검색어 1건 삭제. 없으면 404, 본인 것이 아니면 403.
     *
     * @param userId   로그인 사용자 id
     * @param searchId 삭제할 검색 기록 id
     */
    @Transactional
    public void deleteRecentSearch(Long userId, Long searchId) {
        Long ownerId = searchMapper.selectOwnerId(searchId);
        if (ownerId == null) {
            throw new BusinessException(ErrorCode.SEARCH_HISTORY_NOT_FOUND);
        }
        if (!ownerId.equals(userId)) {
            throw new BusinessException(ErrorCode.SEARCH_HISTORY_FORBIDDEN);
        }
        // user_id로 스코프해 소유자 것만 삭제(방어 심화). 소유 확인 직후라 보통 1행,
        // 0행이면 확인~삭제 사이 동시 삭제된 경쟁 상황 → 멱등이라 성공 처리하되 흔적을 남긴다.
        int deleted = searchMapper.deleteById(searchId, userId);
        if (deleted == 0) {
            log.warn("검색 기록 삭제 0행 (경쟁 삭제 추정): searchId={}, userId={}", searchId, userId);
        }
    }

    /** 로그인 사용자의 검색 기록 전체 삭제. */
    @Transactional
    public void deleteAllRecentSearches(Long userId) {
        searchMapper.deleteAllByUser(userId);
    }
}

package com.helloworld.domain.search.mapper;

import com.helloworld.domain.search.dto.response.PostSearchResponse;
import com.helloworld.domain.search.dto.response.RecentSearchResponse;
import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 검색 DB 접근 (MyBatis). SQL은 resources/mapper/search/SearchMapper.xml 에 작성.
 * namespace가 이 인터페이스 FQCN과 일치해야 한다.
 */
@Mapper
public interface SearchMapper {

    /** 특정 유저의 최근 검색어를 최신순으로 limit개 조회 */
    List<RecentSearchResponse> selectRecentByUser(@Param("userId") Long userId,
                                                  @Param("limit") int limit);

    /** 검색 기록의 소유자 user_id (없으면 null) — 삭제 전 존재·소유 확인용 */
    Long selectOwnerId(@Param("searchId") Long searchId);

    /** 검색 기록 1건 삭제 (user_id로 스코프 — 소유자 것만 삭제, 방어 심화) */
    int deleteById(@Param("searchId") Long searchId, @Param("userId") Long userId);

    /** 특정 유저의 전체 검색 기록 삭제 */
    int deleteAllByUser(@Param("userId") Long userId);

    /* ===================== 통합 검색 ===================== */

    /** 유저 검색: nickname 부분일치(user_id 내림차순 커서). keyword는 LIKE 이스케이프된 값. */
    List<UserSummaryResponse> searchUsers(@Param("keyword") String keyword,
                                          @Param("cursor") Long cursor,
                                          @Param("limit") int limit);

    /** 게시물 검색: content ngram FULLTEXT(post_id 내림차순 커서). booleanQuery는 '"kw"' 형태. */
    List<PostSearchResponse> searchPostsByContent(@Param("booleanQuery") String booleanQuery,
                                                @Param("cursor") Long cursor,
                                                @Param("limit") int limit);

    /** 기술스택 검색: tags(TECH)→post_tags→posts(post_id 내림차순 커서). keyword는 LIKE 이스케이프된 값. */
    List<PostSearchResponse> searchPostsByTechStack(@Param("keyword") String keyword,
                                                  @Param("cursor") Long cursor,
                                                  @Param("limit") int limit);

    /* ===================== 검색어 자동저장 ===================== */

    /** 검색어 저장(UPSERT). uk_search_histories 중복이면 searched_at만 최신화(최상단). */
    int upsertHistory(@Param("userId") Long userId,
                      @Param("keyword") String keyword,
                      @Param("searchType") String searchType);

    /** 유저의 최근 keepN개만 남기고 오래된 검색 기록 삭제. */
    int pruneHistory(@Param("userId") Long userId, @Param("keepN") int keepN);
}

package com.helloworld.domain.search.service;

import com.helloworld.domain.search.dto.response.PostSearchResponse;
import com.helloworld.domain.search.dto.response.RecentSearchResponse;
import com.helloworld.domain.search.dto.response.SearchAllResponse;
import com.helloworld.domain.search.mapper.SearchMapper;
import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.springframework.dao.RecoverableDataAccessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * SearchService 최근 검색어 조회·삭제 단위 테스트. SearchMapper는 목으로 대체한다.
 */
@ExtendWith(MockitoExtension.class)
class SearchServiceTest {

    private static final Long ME = 1L;
    private static final Long SEARCH_ID = 100L;

    @Mock
    private SearchMapper searchMapper;

    @InjectMocks
    private SearchService searchService;

    @Test
    @DisplayName("최근 검색어: limit이 상한(20)을 넘으면 20으로 보정해 조회한다")
    void getRecentClampsUpperLimit() {
        given(searchMapper.selectRecentByUser(ME, 20)).willReturn(List.of());

        searchService.getRecentSearches(ME, 100);

        verify(searchMapper).selectRecentByUser(ME, 20);
    }

    @Test
    @DisplayName("최근 검색어: limit이 0 이하이면 1로 보정한다")
    void getRecentClampsLowerLimit() {
        given(searchMapper.selectRecentByUser(ME, 1)).willReturn(List.of());

        searchService.getRecentSearches(ME, 0);

        verify(searchMapper).selectRecentByUser(ME, 1);
    }

    @Test
    @DisplayName("최근 검색어: 매퍼가 돌려준 목록을 그대로 반환한다")
    void getRecentReturnsMapperResult() {
        RecentSearchResponse row = new RecentSearchResponse();
        row.setSearchId(5L);
        row.setKeyword("React");
        row.setSearchType("TECH_STACK");
        given(searchMapper.selectRecentByUser(ME, 10)).willReturn(List.of(row));

        List<RecentSearchResponse> result = searchService.getRecentSearches(ME, 10);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getKeyword()).isEqualTo("React");
        assertThat(result.get(0).getSearchType()).isEqualTo("TECH_STACK");
    }

    @Test
    @DisplayName("삭제: 없는 기록이면 SEARCH_HISTORY_NOT_FOUND, 삭제는 하지 않는다")
    void deleteNotFound() {
        given(searchMapper.selectOwnerId(SEARCH_ID)).willReturn(null);

        assertThatThrownBy(() -> searchService.deleteRecentSearch(ME, SEARCH_ID))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.SEARCH_HISTORY_NOT_FOUND);

        verify(searchMapper, never()).deleteById(anyLong(), anyLong());
    }

    @Test
    @DisplayName("삭제: 본인 기록이 아니면 SEARCH_HISTORY_FORBIDDEN, 삭제는 하지 않는다")
    void deleteForbidden() {
        given(searchMapper.selectOwnerId(SEARCH_ID)).willReturn(999L); // 남의 기록

        assertThatThrownBy(() -> searchService.deleteRecentSearch(ME, SEARCH_ID))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.SEARCH_HISTORY_FORBIDDEN);

        verify(searchMapper, never()).deleteById(anyLong(), anyLong());
    }

    @Test
    @DisplayName("삭제: 본인 기록이면 삭제한다")
    void deleteSuccess() {
        given(searchMapper.selectOwnerId(SEARCH_ID)).willReturn(ME);
        given(searchMapper.deleteById(SEARCH_ID, ME)).willReturn(1);

        searchService.deleteRecentSearch(ME, SEARCH_ID);

        verify(searchMapper).deleteById(SEARCH_ID, ME);
    }

    @Test
    @DisplayName("전체 삭제: 유저의 전체 기록 삭제를 호출한다")
    void deleteAll() {
        searchService.deleteAllRecentSearches(ME);

        verify(searchMapper).deleteAllByUser(ME);
    }

    /* ===================== 통합 검색 ===================== */

    @Test
    @DisplayName("검색: 키워드가 널/빈값이면 SEARCH_EMPTY_KEYWORD")
    void searchEmptyKeyword() {
        assertThatThrownBy(() -> searchService.search(ME, null, "ALL", null, 15))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.SEARCH_EMPTY_KEYWORD);
    }

    @Test
    @DisplayName("검색: 키워드가 2자 미만이면 SEARCH_KEYWORD_TOO_SHORT")
    void searchTooShort() {
        assertThatThrownBy(() -> searchService.search(ME, "a", "ALL", null, 15))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.SEARCH_KEYWORD_TOO_SHORT);
    }

    @Test
    @DisplayName("검색: 알 수 없는 type이면 COMMON_INVALID_PARAM")
    void searchInvalidType() {
        assertThatThrownBy(() -> searchService.search(ME, "spring", "WRONG", null, 15))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COMMON_INVALID_PARAM);
    }

    @Test
    @DisplayName("검색: type=ALL이면 3범주 각 상위 3건을 모아 SearchAllResponse 반환")
    void searchAllReturnsGroups() {
        given(searchMapper.searchUsers("spring", null, 3)).willReturn(List.of());
        given(searchMapper.searchPostsByContent("\"spring\"", null, 3)).willReturn(List.of());
        given(searchMapper.searchPostsByTechStack("spring", null, 3)).willReturn(List.of());

        Object res = searchService.search(ME, "spring", "ALL", null, 15);

        assertThat(res).isInstanceOf(SearchAllResponse.class);
    }

    @Test
    @DisplayName("검색: type=USER는 size+1 커서 조회 + 와일드카드 이스케이프 적용")
    void searchUserEscapesAndPaginates() {
        given(searchMapper.searchUsers("a\\%b", null, 3))
                .willReturn(List.of(new UserSummaryResponse()));

        Object res = searchService.search(ME, "a%b", "USER", null, 2);

        assertThat(res).isInstanceOf(CursorResponse.class);
        verify(searchMapper).searchUsers("a\\%b", null, 3); // % → \% 이스케이프, size 2 → limit 3
    }

    @Test
    @DisplayName("검색: type=POST는 boolean phrase로 감싸 ngram 조회한다")
    void searchPostBuildsBooleanQuery() {
        given(searchMapper.searchPostsByContent("\"spring\"", null, 3)).willReturn(List.of());

        searchService.search(ME, "spring", "POST", null, 2);

        verify(searchMapper).searchPostsByContent("\"spring\"", null, 3);
    }

    @Test
    @DisplayName("검색: type=TECH_STACK은 태그 부분일치로 게시물을 커서 조회한다")
    void searchTechStackPaginates() {
        given(searchMapper.searchPostsByTechStack("spring", null, 3)).willReturn(List.of());

        Object res = searchService.search(ME, "spring", "TECH_STACK", null, 2);

        assertThat(res).isInstanceOf(CursorResponse.class);
        verify(searchMapper).searchPostsByTechStack("spring", null, 3); // size 2 → limit 3
    }

    @Test
    @DisplayName("검색: TECH_STACK 결과의 matched_stacks(매칭 태그명)를 그대로 실어 반환한다")
    void searchTechStackCarriesMatchedStacks() {
        PostSearchResponse row = new PostSearchResponse();
        row.setPostId(42L);
        row.setMatchedStacks(List.of("React", "React Native"));
        given(searchMapper.searchPostsByTechStack("react", null, 3)).willReturn(List.of(row));

        Object res = searchService.search(ME, "react", "TECH_STACK", null, 2);

        assertThat(res).isInstanceOf(CursorResponse.class);
        @SuppressWarnings("unchecked")
        CursorResponse<PostSearchResponse> cursor = (CursorResponse<PostSearchResponse>) res;
        assertThat(cursor.getItems()).hasSize(1);
        assertThat(cursor.getItems().get(0).getMatchedStacks())
                .containsExactly("React", "React Native");
    }

    @Test
    @DisplayName("검색: 연산자만 있는 키워드(POST)는 content 조회 없이 빈 결과")
    void searchContentOperatorsOnlyReturnsEmpty() {
        Object res = searchService.search(ME, "++", "POST", null, 2);

        assertThat(res).isInstanceOf(CursorResponse.class);
        verify(searchMapper, never()).searchPostsByContent(any(), any(), anyInt());
    }

    /* ===================== 검색어 자동저장 ===================== */

    @Test
    @DisplayName("자동저장: 신규 검색어(반환 1)면 UPSERT 후 최대 10개로 정리한다")
    void recordSearchUpsertsAndPrunes() {
        given(searchMapper.upsertHistory(ME, "spring", "POST")).willReturn(1); // 신규 INSERT

        searchService.recordSearch(ME, "spring", "POST");

        verify(searchMapper).upsertHistory(ME, "spring", "POST");
        verify(searchMapper).pruneHistory(ME, 10);
    }

    @Test
    @DisplayName("자동저장: 기존 검색어 갱신(반환 2)이면 prune하지 않는다")
    void recordSearchSkipsPruneOnUpdate() {
        given(searchMapper.upsertHistory(ME, "spring", "POST")).willReturn(2); // 기존 행 갱신

        searchService.recordSearch(ME, "spring", "POST");

        verify(searchMapper, never()).pruneHistory(anyLong(), anyInt());
    }

    @Test
    @DisplayName("자동저장: rawType 소문자도 표준(대문자)으로 저장한다")
    void recordSearchNormalizesType() {
        given(searchMapper.upsertHistory(ME, "spring", "POST")).willReturn(1);

        searchService.recordSearch(ME, "spring", "post");

        verify(searchMapper).upsertHistory(ME, "spring", "POST");
    }

    @Test
    @DisplayName("자동저장: DB 오류(DataAccessException)는 삼켜 검색에 영향 없다")
    void recordSearchSwallowsDbError() {
        given(searchMapper.upsertHistory(ME, "spring", "POST"))
                .willThrow(new RecoverableDataAccessException("db down"));

        assertThatCode(() -> searchService.recordSearch(ME, "spring", "POST"))
                .doesNotThrowAnyException();
        verify(searchMapper, never()).pruneHistory(anyLong(), anyInt());
    }

    @Test
    @DisplayName("자동저장: 널/빈값/2자 미만이면 저장하지 않는다")
    void recordSearchSkipsInvalid() {
        searchService.recordSearch(ME, null, "ALL");
        searchService.recordSearch(ME, "   ", "ALL");
        searchService.recordSearch(ME, "a", "ALL");

        verify(searchMapper, never()).upsertHistory(anyLong(), any(), any());
        verify(searchMapper, never()).pruneHistory(anyLong(), anyInt());
    }
}

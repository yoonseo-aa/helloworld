package com.helloworld.domain.search.controller;

import com.helloworld.domain.search.dto.response.RecentSearchResponse;
import com.helloworld.domain.search.service.SearchService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 검색 API. 모든 엔드포인트는 로그인(JWT) 후에만 동작한다.
 * 통합/카테고리 검색 + 최근 검색어(search_histories) 조회·삭제를 담당한다.
 */
@RestController
@RequestMapping("/api/search")   // 리소스형, /api/ 접두어(버전 없음)
@RequiredArgsConstructor
public class SearchController {

    private final SearchService searchService;

    /**
     * 통합/카테고리 검색. type=ALL이면 범주별 상위 3건, 단일 범주면 커서 페이징.
     * keyword는 required=false로 받고 서비스에서 검증한다(누락·빈값 모두 SEARCH_EMPTY_KEYWORD 400).
     */
    @GetMapping
    public ResponseEntity<ApiResponse<Object>> search(
            @LoginUserId Long userId,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "type", defaultValue = "ALL") String type,
            @RequestParam(value = "cursor", required = false) Long cursor,
            @RequestParam(value = "size", defaultValue = "15") int size) {
        Object data = searchService.search(userId, keyword, type, cursor, size);
        // 검색 성공 시에만(위에서 예외 없으면) 검색어를 비동기로 자동저장(best-effort)
        searchService.recordSearch(userId, keyword, type);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /** 최근 검색어 조회 (최신순, 기본 10개) */
    @GetMapping("/recent")
    public ResponseEntity<ApiResponse<List<RecentSearchResponse>>> getRecentSearches(
            @LoginUserId Long userId,
            @RequestParam(value = "limit", defaultValue = "10") int limit) {
        List<RecentSearchResponse> data = searchService.getRecentSearches(userId, limit);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /** 최근 검색어 개별 삭제 */
    @DeleteMapping("/recent/{searchId}")
    public ResponseEntity<ApiResponse<Void>> deleteRecentSearch(
            @LoginUserId Long userId,
            @PathVariable("searchId") Long searchId) {
        searchService.deleteRecentSearch(userId, searchId);
        return ResponseEntity.ok(ApiResponse.success("검색 기록이 삭제되었습니다."));
    }

    /** 최근 검색어 전체 삭제 */
    @DeleteMapping("/recent")
    public ResponseEntity<ApiResponse<Void>> deleteAllRecentSearches(@LoginUserId Long userId) {
        searchService.deleteAllRecentSearches(userId);
        return ResponseEntity.ok(ApiResponse.success("검색 기록이 전체 삭제되었습니다."));
    }
}

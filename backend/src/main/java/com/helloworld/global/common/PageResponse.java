package com.helloworld.global.common;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 오프셋 기반 페이징 응답 공통 포맷.
 * 공통 API 규약서의 오프셋 페이징 구조를 따른다.
 * (무한 스크롤/커서 방식이 필요한 도메인은 별도 CursorResponse를 사용)
 */
@Getter
@Builder
public class PageResponse<T> {

    private final List<T> items;   // 결과 목록 (0건이면 빈 배열)
    private final int page;        // 현재 페이지 (0부터)
    private final int size;        // 페이지당 항목 수
    private final long totalCount; // 전체 개수
    private final int totalPages;  // 전체 페이지 수

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalCount) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) totalCount / size);
        return PageResponse.<T>builder()
                .items(items)
                .page(page)
                .size(size)
                .totalCount(totalCount)
                .totalPages(totalPages)
                .build();
    }
}

package com.helloworld.global.common;

import lombok.Builder;
import lombok.Getter;

import java.util.List;
import java.util.function.Function;

/**
 * 커서 기반(무한 스크롤) 페이징 응답 공통 포맷.
 * 오프셋 방식(PageResponse)과 달리 "다음 페이지가 있는지 + 다음 커서 값"만 내려준다.
 * COUNT 쿼리 없이 "size+1개를 조회해서 마지막 1개로 다음 페이지 여부를 판단"하는 방식으로 쓴다.
 */
@Getter
@Builder
public class CursorResponse<T> {

    private final List<T> items;      // 이번 페이지 결과 (요청한 size 이하)
    private final Long nextCursor;    // 다음 요청에 넘길 커서. 마지막 페이지면 null
    private final boolean hasNext;    // 다음 페이지 존재 여부

    /**
     * @param fetched        size+1개를 조회한 원본 리스트 (Mapper가 limit=size+1로 조회해서 넘긴다)
     * @param size           클라이언트가 요청한 페이지 크기
     * @param cursorExtractor 마지막 항목에서 다음 커서 값(주로 PK)을 뽑는 함수
     */
    public static <T> CursorResponse<T> of(List<T> fetched, int size, Function<T, Long> cursorExtractor) {
        boolean hasNext = fetched.size() > size;
        List<T> items = hasNext ? fetched.subList(0, size) : fetched;
        Long nextCursor = hasNext ? cursorExtractor.apply(items.get(items.size() - 1)) : null;
        return CursorResponse.<T>builder()
                .items(items)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .build();
    }
}

package com.helloworld.global.common;

/**
 * 커서 페이징 요청의 페이지 크기 정책(하한·상한)을 한곳에 모은다.
 * 과대 요청으로 대량 조회하는 것을 막고, 0/음수 요청은 최소 1로 올린다.
 * 컨트롤러별로 clamp 식을 중복하지 말고 이 유틸을 쓴다.
 */
public final class PageSize {

    /** 한 페이지 최대 개수 (명세 기준). */
    public static final int MAX = 50;

    private PageSize() {
    }

    /** size를 [1, MAX] 범위로 보정한다. */
    public static int clamp(int size) {
        return Math.min(Math.max(size, 1), MAX);
    }
}

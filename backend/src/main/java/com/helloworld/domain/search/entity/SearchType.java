package com.helloworld.domain.search.entity;

import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;

/**
 * 검색 카테고리. GET /api/search 의 type 파라미터에 대응한다.
 * ALL(전체)·USER(유저)·POST(게시물 본문)·TECH_STACK(기술스택→게시물).
 */
public enum SearchType {

    ALL, USER, POST, TECH_STACK;

    /** 문자열 파라미터 → enum. null/빈값은 ALL, 알 수 없는 값은 400. */
    public static SearchType from(String raw) {
        if (raw == null || raw.isBlank()) {
            return ALL;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM);
        }
    }
}

package com.helloworld.domain.badge.entity;

import lombok.Getter;

/**
 * 배지 축. 축마다 브론즈 · 실버 · 골드 3단계가 있어 4축 × 3티어 = 12종이다.
 *
 * <p>축을 명시적으로 두는 이유는 화면 때문이다. 프로필에는 <b>축별 최고 등급 하나씩</b>만 노출한다.
 * 같은 축의 하위 등급을 나란히 보여주면(브론즈 · 실버 · 골드 세 개가 동시에) 성취가 오히려
 * 흐려 보이고, 12개가 전부 깔리면 프로필이 배지로 뒤덮인다.
 */
@Getter
public enum BadgeAxis {

    POST("게시"),
    LIKE("받은 좋아요"),
    COMMENT("댓글 활동"),
    GITHUB("GitHub");

    private final String label;

    BadgeAxis(String label) {
        this.label = label;
    }
}

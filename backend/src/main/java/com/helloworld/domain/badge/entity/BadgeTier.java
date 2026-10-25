package com.helloworld.domain.badge.entity;

/**
 * 배지 등급. 선언 순서가 곧 등급 순서라, {@code ordinal()} 비교로 상위 등급을 가린다
 * ({@link BadgeCode#highestPerAxis}). <b>순서를 바꾸면 판정이 뒤집히므로 주의.</b>
 *
 * <p>색과 표시명은 여기 두지 않는다 — 화면에서 등급 표현이 단색에서 그라디언트로 바뀌면서
 * 프론트가 {@code tier} 문자열로 직접 팔레트를 고르게 됐다(AchievementBadges.tsx의 PAL).
 * 백엔드가 색을 내려줘도 아무도 읽지 않고, 시안이 바뀔 때 배포만 한 번 더 필요해진다.
 *
 * <p>등급이 축마다 달라지는 일은 없다 — 축이 늘어도 브론즈 · 실버 · 골드 셋을 그대로 쓴다.
 */
public enum BadgeTier {
    BRONZE,
    SILVER,
    GOLD
}

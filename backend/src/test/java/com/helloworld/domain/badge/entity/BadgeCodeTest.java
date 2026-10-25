package com.helloworld.domain.badge.entity;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 배지 판정 단위 테스트. 임계값 경계와 "축별 최고 등급 하나" 규칙을 검증한다
 * (순수 Java, DB/스프링 불필요).
 *
 * <p>경계값을 굳이 테스트하는 이유: 임계값이 "이상"인지 "초과"인지는 코드만 봐서는
 * 놓치기 쉽고, 화면에서도 딱 30편일 때만 어긋나서 발견이 늦다.
 */
class BadgeCodeTest {

    private static BadgeMetrics metrics(int posts, int likes, int comments, int activeDays) {
        return new BadgeMetrics(posts, likes, comments, activeDays);
    }

    @Test
    @DisplayName("임계값은 '이상'이다 — 딱 기준값이면 달성, 하나 모자라면 미달성")
    void thresholdIsInclusive() {
        assertThat(BadgeCode.POST_GOLD.isAchieved(metrics(30, 0, 0, 0))).isTrue();
        assertThat(BadgeCode.POST_GOLD.isAchieved(metrics(29, 0, 0, 0))).isFalse();

        assertThat(BadgeCode.LIKE_SILVER.isAchieved(metrics(0, 50, 0, 0))).isTrue();
        assertThat(BadgeCode.LIKE_SILVER.isAchieved(metrics(0, 49, 0, 0))).isFalse();

        assertThat(BadgeCode.COMMENT_BRONZE.isAchieved(metrics(0, 0, 10, 0))).isTrue();
        assertThat(BadgeCode.COMMENT_BRONZE.isAchieved(metrics(0, 0, 9, 0))).isFalse();

        assertThat(BadgeCode.GITHUB_GOLD.isAchieved(metrics(0, 0, 0, 100))).isTrue();
        assertThat(BadgeCode.GITHUB_GOLD.isAchieved(metrics(0, 0, 0, 99))).isFalse();
    }

    @Test
    @DisplayName("활동이 전혀 없으면 배지가 하나도 없다 — 신규 가입자는 빈 목록")
    void noActivityYieldsNothing() {
        assertThat(BadgeCode.highestPerAxis(BadgeMetrics.empty())).isEmpty();
    }

    @Test
    @DisplayName("한 축에서 골드를 달성해도 브론즈·실버는 함께 나오지 않는다 (축별 하나)")
    void onlyHighestTierPerAxis() {
        // 게시글 42편이면 브론즈(1)·실버(10)·골드(30)를 모두 만족하지만 골드만 남아야 한다
        List<BadgeCode> result = BadgeCode.highestPerAxis(metrics(42, 0, 0, 0));

        assertThat(result).containsExactly(BadgeCode.POST_GOLD);
    }

    @Test
    @DisplayName("네 축을 모두 달성하면 축 선언 순서(게시·좋아요·댓글·GitHub)로 4개가 나온다")
    void allFourAxesInDeclaredOrder() {
        // 순서를 고정해두지 않으면 데이터가 같아도 화면의 배지 배치가 매번 달라진다
        List<BadgeCode> result = BadgeCode.highestPerAxis(metrics(42, 63, 12, 35));

        assertThat(result).containsExactly(
                BadgeCode.POST_GOLD,        // 42 >= 30
                BadgeCode.LIKE_SILVER,      // 63 >= 50, 200 미달
                BadgeCode.COMMENT_BRONZE,   // 12 >= 10, 50 미달
                BadgeCode.GITHUB_SILVER);   // 35 >= 30, 100 미달
    }

    @Test
    @DisplayName("달성한 축만 나온다 — GitHub 미연동(activeDays=0)이면 나머지 3축만")
    void unachievedAxesAreOmitted() {
        List<BadgeCode> result = BadgeCode.highestPerAxis(metrics(5, 10, 10, 0));

        assertThat(result).containsExactly(
                BadgeCode.POST_BRONZE,
                BadgeCode.LIKE_BRONZE,
                BadgeCode.COMMENT_BRONZE);
    }

    @Test
    @DisplayName("12종 전부가 4축 × 3티어로 빠짐없이 정의돼 있다")
    void twelveBadgesCoverEveryAxisAndTier() {
        assertThat(BadgeCode.values()).hasSize(12);

        for (BadgeAxis axis : BadgeAxis.values()) {
            for (BadgeTier tier : BadgeTier.values()) {
                assertThat(BadgeCode.values())
                        .as("%s 축의 %s 배지", axis, tier)
                        .anyMatch(code -> code.getAxis() == axis && code.getTier() == tier);
            }
        }
    }

    @Test
    @DisplayName("같은 축 안에서 임계값이 브론즈 < 실버 < 골드 순으로 올라간다")
    void thresholdsIncreaseWithTier() {
        // 역전되면 상위 등급이 하위보다 쉬워져 highestPerAxis가 엉뚱한 배지를 고른다
        for (BadgeAxis axis : BadgeAxis.values()) {
            int bronze = thresholdOf(axis, BadgeTier.BRONZE);
            int silver = thresholdOf(axis, BadgeTier.SILVER);
            int gold = thresholdOf(axis, BadgeTier.GOLD);

            assertThat(bronze).as("%s 브론즈 < 실버", axis).isLessThan(silver);
            assertThat(silver).as("%s 실버 < 골드", axis).isLessThan(gold);
        }
    }

    private static int thresholdOf(BadgeAxis axis, BadgeTier tier) {
        return java.util.Arrays.stream(BadgeCode.values())
                .filter(code -> code.getAxis() == axis && code.getTier() == tier)
                .findFirst()
                .orElseThrow()
                .getThreshold();
    }
}

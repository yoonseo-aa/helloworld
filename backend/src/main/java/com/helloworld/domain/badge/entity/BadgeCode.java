package com.helloworld.domain.badge.entity;

import com.helloworld.domain.github.entity.CommitBadge;
import lombok.Getter;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.ToIntFunction;

/**
 * 배지 12종. 4축(게시 · 받은 좋아요 · 댓글 · GitHub) × 3티어(브론즈 · 실버 · 골드).
 *
 * <p><b>저장하지 않고 계산한다.</b> 게시글을 지우거나 좋아요가 취소되면 수치가 줄어드는데,
 * 저장해두면 "좋아요 50개" 배지를 단 사람의 실제 좋아요가 10개인 상태가 만들어진다.
 * 표시된 배지가 거짓이 되는 것보다는, 조건에서 벗어나면 사라지는 편이 낫다고 봤다.
 * 같은 이유로 {@link CommitBadge}도 저장하지 않는다. ({@code user_badges} 테이블은 미사용)
 *
 * <p>대신 획득 알림은 줄 수 없다. 알리려면 직전 상태를 알아야 하는데 저장하는 게 없기 때문이다.
 * 알림이 필요해지면 그때 스냅샷을 도입해야 한다.
 *
 * <p><b>임계값이 전부 이 파일에 모여 있다.</b> 시연용으로 낮추거나 밸런스를 조정할 때
 * 여기만 고치면 되고, 축이 늘어도 상수 3개를 추가하는 것으로 끝난다.
 *
 * <p>GitHub 축의 기준값은 {@link CommitBadge}에서 가져온다. 잔디 응답이 이미 그 값으로
 * 등급을 계산하고 있어서, 숫자를 여기 다시 적으면 두 화면이 서로 다른 등급을 보여주게 된다.
 */
@Getter
public enum BadgeCode {

    /* ===== 게시 ===== */
    POST_BRONZE("첫 발자국",   BadgeAxis.POST, BadgeTier.BRONZE, BadgeMetrics::getPostCount, 1),
    POST_SILVER("꾸준한 기록", BadgeAxis.POST, BadgeTier.SILVER, BadgeMetrics::getPostCount, 10),
    POST_GOLD  ("기록 장인",   BadgeAxis.POST, BadgeTier.GOLD,   BadgeMetrics::getPostCount, 30),

    /* ===== 받은 좋아요 ===== */
    LIKE_BRONZE("관심의 시작",   BadgeAxis.LIKE, BadgeTier.BRONZE, BadgeMetrics::getReceivedLikes, 10),
    LIKE_SILVER("인기 프로젝트", BadgeAxis.LIKE, BadgeTier.SILVER, BadgeMetrics::getReceivedLikes, 50),
    LIKE_GOLD  ("커뮤니티 등대", BadgeAxis.LIKE, BadgeTier.GOLD,   BadgeMetrics::getReceivedLikes, 200),

    /* ===== 댓글 활동 ===== */
    COMMENT_BRONZE("첫 마디",   BadgeAxis.COMMENT, BadgeTier.BRONZE, BadgeMetrics::getCommentCount, 10),
    COMMENT_SILVER("번개 답변", BadgeAxis.COMMENT, BadgeTier.SILVER, BadgeMetrics::getCommentCount, 50),
    COMMENT_GOLD  ("멘토",      BadgeAxis.COMMENT, BadgeTier.GOLD,   BadgeMetrics::getCommentCount, 200),

    /* ===== GitHub — 최근 1년간 커밋한 날 수(누적). 기준값은 CommitBadge와 공유한다. ===== */
    GITHUB_BRONZE("잔디 심기",       BadgeAxis.GITHUB, BadgeTier.BRONZE, BadgeMetrics::getActiveDays,
            CommitBadge.BRONZE.getMinActiveDays()),
    GITHUB_SILVER("열정 커밋",       BadgeAxis.GITHUB, BadgeTier.SILVER, BadgeMetrics::getActiveDays,
            CommitBadge.SILVER.getMinActiveDays()),
    GITHUB_GOLD  ("오픈소스 기여자", BadgeAxis.GITHUB, BadgeTier.GOLD,   BadgeMetrics::getActiveDays,
            CommitBadge.GOLD.getMinActiveDays());

    private final String label;
    private final BadgeAxis axis;
    private final BadgeTier tier;

    /** 이 배지가 보는 지표. 축이 같으면 같은 지표를 본다. */
    private final ToIntFunction<BadgeMetrics> metric;

    /** 달성에 필요한 최소값(포함). */
    private final int threshold;

    BadgeCode(String label, BadgeAxis axis, BadgeTier tier,
              ToIntFunction<BadgeMetrics> metric, int threshold) {
        this.label = label;
        this.axis = axis;
        this.tier = tier;
        this.metric = metric;
        this.threshold = threshold;
    }

    public boolean isAchieved(BadgeMetrics metrics) {
        return metric.applyAsInt(metrics) >= threshold;
    }

    /** 진행률 표시에 쓸 현재 수치. */
    public int currentValue(BadgeMetrics metrics) {
        return metric.applyAsInt(metrics);
    }

    /**
     * 축별 최고 등급만 골라 반환한다. 달성한 축이 없으면 빈 목록.
     *
     * <p>골드를 달성했으면 같은 축의 브론즈 · 실버도 자동으로 만족하는데, 셋을 다 보여주면
     * 프로필이 중복된 배지로 채워진다. 축마다 가장 높은 하나만 남긴다.
     */
    public static List<BadgeCode> highestPerAxis(BadgeMetrics metrics) {
        Map<BadgeAxis, BadgeCode> best = new EnumMap<>(BadgeAxis.class);

        for (BadgeCode code : values()) {
            if (!code.isAchieved(metrics)) continue;
            BadgeCode current = best.get(code.axis);
            if (current == null || code.tier.ordinal() > current.tier.ordinal()) {
                best.put(code.axis, code);
            }
        }

        // 축 선언 순서로 고정한다 — 달성 순서나 Map 순회 순서에 따라 화면 배치가 바뀌지 않도록.
        return Arrays.stream(BadgeAxis.values())
                .map(best::get)
                .filter(Objects::nonNull)
                .toList();
    }
}

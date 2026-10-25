package com.helloworld.domain.badge.dto.response;

import com.helloworld.domain.badge.entity.BadgeCode;
import com.helloworld.domain.badge.entity.BadgeMetrics;
import lombok.Builder;
import lombok.Getter;

/**
 * 프로필에 노출되는 배지 하나.
 *
 * <p>{@code code}는 프론트가 아이콘을 고르는 데 쓰는 식별자다. 표시용 {@code label}은
 * 기획에 따라 바뀔 수 있으므로, 이름 문자열로 분기하지 않도록 코드를 따로 내려준다.
 *
 * <p>{@code currentValue}는 "좋아요 42개 / 50개" 같은 진행 표시를 위한 값이다.
 * 다음 등급까지 얼마나 남았는지 보여줄 때 쓴다.
 */
@Getter
@Builder
public class BadgeResponse {

    /** BadgeCode enum 이름. 프론트가 아이콘을 고르는 키다 — label이 바뀌어도 이건 안 바뀐다. */
    private final String code;

    /** 표시명("열정 커밋" 등). 툴팁 제목. */
    private final String label;

    /** 축 식별자(POST · LIKE · COMMENT · GITHUB). 프론트 분기는 이 값으로 한다. */
    private final String axis;

    /** 축 표시명("게시", "받은 좋아요" …). 프론트의 Achievement.axis가 쓰던 한글 라벨. */
    private final String axisLabel;

    /** 등급(BRONZE · SILVER · GOLD). 프론트가 타일 그라디언트를 고르는 데 쓴다. */
    private final String tier;

    /** 이 등급 달성에 필요한 값. 프론트가 "· 골드 기준 30편" 문구를 만들 때 쓴다. */
    private final int threshold;

    /** 현재 수치. 프론트가 "42편 · 골드 기준 30편" 진행 표시에 쓴다. */
    private final int currentValue;

    // 색(hex)은 내려주지 않는다 — 타일 표현이 그라디언트로 바뀌면서 프론트가 tier로 직접
    // 고르게 됐다(AchievementBadges.tsx의 PAL). 백엔드가 스타일을 정하는 모양새만 남는다.

    public static BadgeResponse of(BadgeCode badge, BadgeMetrics metrics) {
        return BadgeResponse.builder()
                .code(badge.name())
                .label(badge.getLabel())
                .axis(badge.getAxis().name())
                .axisLabel(badge.getAxis().getLabel())
                .tier(badge.getTier().name())
                .threshold(badge.getThreshold())
                .currentValue(badge.currentValue(metrics))
                .build();
    }
}

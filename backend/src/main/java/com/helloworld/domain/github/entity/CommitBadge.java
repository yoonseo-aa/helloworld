package com.helloworld.domain.github.entity;

import lombok.Getter;

/**
 * 커밋 활동 배지. <b>최근 1년간 커밋한 날 수</b>(github_stats.active_days)로 결정된다.
 *
 * <p><b>왜 DB에 저장하지 않는가</b> — 이 배지는 세 가지 성질을 갖는다.
 * <ul>
 *   <li>지표가 하나뿐이다 (누적 활동일수)</li>
 *   <li>사용자당 최고 등급 하나만 노출한다</li>
 *   <li>조건에서 미달하면 회수된다</li>
 * </ul>
 * 즉 "언제 획득했다"는 영구 기록이 아니라 <b>현재 데이터에서 계산되는 값</b>이다.
 * 저장하면 매일 밤 재계산해 갱신하는 배치가 하나 더 생기고, 저장값과 실제 데이터가
 * 어긋나는 순간(배치 실패, 수동 데이터 수정)이 만들어진다. 계산하면 항상 정확하고 공짜다.
 *
 * <p>{@code user_badges} 테이블은 "첫 게시글 작성" 같은 <b>진짜 영구 성취</b>를 위해 남겨 둔다.
 * 그런 배지는 회수하지 않고 acquired_at도 의미가 있다.
 *
 * <p>임계값을 코드에 두는 이유: 3개뿐이고 등급 이름과 한 몸이라, 테이블로 빼도
 * 조회가 한 번 늘 뿐 바뀌는 게 없다. 등급이 늘거나 운영 중 조정이 필요해지면 그때 옮긴다.
 */
@Getter
public enum CommitBadge {

    /** 커밋한 날이 하루도 없으면 배지 없음. */
    NONE(0, "없음", "#E5E7EB"),

    BRONZE(1, "브론즈", "#CD7F32"),
    SILVER(30, "실버", "#C0C0C0"),
    GOLD(100, "골드", "#FFD700");

    /** 이 등급이 되기 위한 최소 활동일수(포함). */
    private final int minActiveDays;
    private final String label;
    private final String color;

    CommitBadge(int minActiveDays, String label, String color) {
        this.minActiveDays = minActiveDays;
        this.label = label;
        this.color = color;
    }

    /**
     * 활동일수 → 배지 등급.
     *
     * <p>경계는 <b>브론즈 1~29 / 실버 30~99 / 골드 100 이상</b>이다.
     * 요구사항에 "30~99는 실버"와 "1~30 이하는 브론즈"로 30이 양쪽에 걸쳐 있었는데,
     * 30일은 실버로 잡았다("30일 연속" 배지가 실버 시작점이라는 해석).
     */
    public static CommitBadge of(int activeDays) {
        if (activeDays >= GOLD.minActiveDays) return GOLD;
        if (activeDays >= SILVER.minActiveDays) return SILVER;
        if (activeDays >= BRONZE.minActiveDays) return BRONZE;
        return NONE;
    }
}

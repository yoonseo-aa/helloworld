package com.helloworld.domain.github.entity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 프로필에 노출할 기술스택 한 줄. (언어명 + 비율 %)
 *
 * <p><b>DB에 저장하지 않는다.</b> {@code github_stats.languages}에는 언어별 <b>원본 바이트</b>만
 * 두고, 비율과 노출 규칙은 조회할 때 계산한다. 그래야 "상위 5개", "10% 이상" 같은 기준을
 * 바꿀 때 전 사용자 재동기화 없이 코드만 고치면 된다. 배지와 같은 이유다.
 *
 * <p>비율의 분모는 <b>필터링 전 전체 바이트</b>다. 상위 5개만 남긴 뒤 그 합으로 다시 나누면
 * 항상 100%가 되어 "이 사람이 쓰는 언어가 이게 전부"라는 잘못된 인상을 준다.
 */
public record TechStack(String name, int percentage) {

    /** 노출 개수 상한. */
    private static final int MAX_SIZE = 5;

    /**
     * 언어 종류가 이 수 이상이면 자잘한 언어를 걸러낸다.
     * 종류가 적을 때까지 거르면 3~4개짜리 프로필이 텅 비어 보인다.
     */
    private static final int FILTER_THRESHOLD_COUNT = 5;

    /** 위 조건에 걸렸을 때 살아남는 최소 비율(%). */
    private static final int MIN_PERCENTAGE = 10;

    /**
     * 언어별 바이트 수 → 화면에 그릴 기술스택 목록.
     *
     * <p>규칙: 바이트 내림차순 정렬 → 언어가 {@value #FILTER_THRESHOLD_COUNT}종 이상이면
     * {@value #MIN_PERCENTAGE}% 미만 제거 → 상위 {@value #MAX_SIZE}개.
     *
     * <p>비율은 반올림한다. 합이 100이 안 될 수 있는데(반올림 오차 + 하위 항목 절삭)
     * 의도된 것이다 — 위 주석 참고.
     */
    public static List<TechStack> of(Map<String, Long> languageBytes) {
        if (languageBytes == null || languageBytes.isEmpty()) {
            return List.of();
        }

        long total = languageBytes.values().stream().mapToLong(Long::longValue).sum();
        if (total <= 0) {
            return List.of();
        }

        List<TechStack> sorted = languageBytes.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> new TechStack(e.getKey(), (int) Math.round(e.getValue() * 100.0 / total)))
                .toList();

        List<TechStack> filtered = new ArrayList<>(sorted);
        if (sorted.size() >= FILTER_THRESHOLD_COUNT) {
            filtered = sorted.stream()
                    .filter(s -> s.percentage() >= MIN_PERCENTAGE)
                    .toList();

            // 언어가 잘게 흩어져 10%를 넘는 게 하나도 없는 경우가 있다(예: 12종이 고르게 8%씩).
            // 그대로 두면 기술스택이 통째로 사라져 "연동은 됐는데 아무것도 없는" 화면이 된다.
            // 그럴 때는 규칙을 접고 1위만이라도 보여준다.
            if (filtered.isEmpty()) {
                filtered = List.of(sorted.get(0));
            }
        }

        return filtered.stream().limit(MAX_SIZE).toList();
    }
}

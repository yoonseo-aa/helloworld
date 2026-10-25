package com.helloworld.domain.github.dto.response;

import com.helloworld.domain.github.client.GithubGraphQlClient.DailyCommit;
import com.helloworld.domain.github.entity.CommitBadge;
import com.helloworld.domain.github.entity.TechStack;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 프로필 GitHub 정보 조회 응답 (GET /api/users/{user_id}/github).
 *
 * <p>JSON은 프로젝트 규약대로 snake_case로 나간다
 * (github_login / last_synced_at / active_days / badge / tech_stacks / contributions[]).
 *
 * <p>contributions는 from~to의 <b>모든 날짜</b>가 빠짐없이 들어간다. DB에는 커밋이 있는 날만
 * 저장되지만, 프론트는 이 배열을 7개씩 잘라 주(週) 열을 만든다. 배열에 하루라도 빠지면
 * 그 뒤 칸이 통째로 밀려서 요일이 어긋나므로 서버가 0으로 채워 길이를 보장한다.
 *
 * <p>시작일도 <b>일요일로 맞춰서</b> 내려준다. 잔디는 각 열이 일~토이므로,
 * 임의의 날짜에서 시작하면 첫 열의 요일이 틀어진다.
 */
@Getter
@Builder
public class GithubContributionResponse {

    private String githubLogin;

    /** 마지막 동기화 시각. 한 번도 성공한 적 없으면 null이라 응답에서 빠진다(non_null 직렬화). */
    private LocalDateTime lastSyncedAt;

    /** 조회 구간(포함). from은 항상 일요일이다. */
    private LocalDate from;
    private LocalDate to;

    /** 최근 1년 커밋 합계(공개 + 비공개). 화면의 "1년간 N회 커밋". */
    private int totalCommits;

    /** 위 합계의 내역. "private 숨기기" 옵션이나 공개 활동만 강조할 때 쓴다. */
    private int publicCommits;
    private int privateCommits;

    /** 커밋한 날 수. 배지 기준이자, 화면에 "1년간 N일 활동"으로 쓸 수 있는 값. */
    private int activeDays;

    private BadgeResponse badge;

    /**
     * 기술스택. 언어별 코드량(바이트) 비율이며 저장된 값이 아니라 조회 시 계산된다.
     *
     * <p>비율의 합은 100이 아닐 수 있다 — 상위 항목만 노출하고 분모는 전체 코드량이기 때문이다.
     * 100%로 정규화하면 "이 사람이 쓰는 언어가 이게 전부"라는 잘못된 인상을 준다.
     */
    private List<TechStackResponse> techStacks;

    private List<CommitDay> contributions;

    /**
     * 커밋 활동 배지. 저장된 값이 아니라 activeDays에서 계산된다.
     * 등급이 NONE이면 필드 자체를 내리지 않는다(프론트가 배지 영역을 숨길 수 있게).
     */
    @Getter
    @Builder
    public static class BadgeResponse {
        private String tier;        // BRONZE / SILVER / GOLD
        private String label;       // 브론즈 / 실버 / 골드
        private String color;
        private int minActiveDays;  // 이 등급의 시작 기준. 화면에서 "다음 등급까지" 계산에 쓸 수 있다.
    }

    /** 기술스택 한 줄. */
    @Getter
    @Builder
    public static class TechStackResponse {
        private String name;        // 언어명 (GitHub 표기 그대로: TypeScript, Java, C++ ...)
        private int percentage;
    }

    /**
     * 잔디 한 칸. count는 공개 + 비공개 합계다.
     *
     * <p>일별 공개/비공개 분리는 일부러 내리지 않는다. 격자는 합계로 색을 칠하고 툴팁도
     * 합계면 충분해서 쓸 데가 없는데, 필드를 넣어두면 프론트가 쓰기 시작해 나중에 못 뺀다.
     * DB(daily_commits)에는 {@code [공개, 비공개]} 로 남아 있으므로, "private 숨기기" 같은
     * 기능이 생기면 여기에 필드를 추가하기만 하면 된다 — 재동기화가 필요 없다.
     */
    @Getter
    @Builder
    public static class CommitDay {
        private LocalDate date;
        private int count;
    }

    /**
     * DB에서 읽은 값들을 화면용 응답으로 조립한다.
     *
     * @param dailyCommits  커밋한 날만 담긴 맵. 나머지 날짜는 0으로 채워진다.
     * @param languageBytes 언어별 원본 바이트. 비율·상위 N개 규칙은 여기서 적용된다.
     * @param activeDays    저장된 집계 컬럼 값. 맵 크기로도 구할 수 있지만, 배지 기준이
     *                      저장 시점 값과 일치하도록 컬럼 값을 그대로 쓴다.
     *
     * <p>커밋 합계는 반대로 <b>맵에서 직접 센다</b>. {@code github_stats.total_commits} 컬럼도
     * 있지만 그건 "활동량 순 랭킹"처럼 JSON을 파싱하지 않고 정렬해야 할 때를 위한 것이고,
     * 응답에서까지 그 값을 쓰면 컬럼과 맵이 어긋났을 때 합계와 내역이 안 맞는 응답이 나간다.
     */
    public static GithubContributionResponse of(String githubLogin, LocalDateTime lastSyncedAt,
                                                LocalDate from, LocalDate to,
                                                Map<LocalDate, DailyCommit> dailyCommits,
                                                Map<String, Long> languageBytes,
                                                int activeDays) {
        List<CommitDay> days = new ArrayList<>();
        int publicCommits = 0;
        int privateCommits = 0;

        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DailyCommit c = dailyCommits.get(d);
            int publicCount = (c == null) ? 0 : c.publicCount();
            int privateCount = (c == null) ? 0 : c.privateCount();

            publicCommits += publicCount;
            privateCommits += privateCount;

            days.add(CommitDay.builder()
                    .date(d)
                    .count(publicCount + privateCount)
                    .build());
        }

        List<TechStackResponse> techStacks = TechStack.of(languageBytes).stream()
                .map(s -> TechStackResponse.builder()
                        .name(s.name())
                        .percentage(s.percentage())
                        .build())
                .toList();

        CommitBadge badge = CommitBadge.of(activeDays);

        return GithubContributionResponse.builder()
                .githubLogin(githubLogin)
                .lastSyncedAt(lastSyncedAt)
                .from(from)
                .to(to)
                .totalCommits(publicCommits + privateCommits)
                .publicCommits(publicCommits)
                .privateCommits(privateCommits)
                .activeDays(activeDays)
                .badge(badge == CommitBadge.NONE ? null : BadgeResponse.builder()
                        .tier(badge.name())
                        .label(badge.getLabel())
                        .color(badge.getColor())
                        .minActiveDays(badge.getMinActiveDays())
                        .build())
                .techStacks(techStacks)
                .contributions(days)
                .build();
    }
}

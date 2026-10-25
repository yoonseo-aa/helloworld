package com.helloworld.domain.github.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * github_stats 테이블 매핑 객체. <b>사용자당 1행</b>이고 1년치 잔디와 기술스택이 여기 다 들어 있다.
 *
 * <p>{@link #dailyCommits}, {@link #languages}는 DB의 JSON 컬럼을 <b>문자열 그대로</b> 담는다.
 * MyBatis에 JSON 타입 핸들러를 붙이지 않고 {@code GithubStatsCodec}에서 변환한다 —
 * 타입 핸들러를 쓰면 이 엔티티가 Jackson에 의존하게 되고, 매퍼 XML에도 핸들러 지정이
 * 흩어져서 "어디서 변환되는지"가 안 보이게 된다. 변환 지점을 한 곳에 모아 둔다.
 *
 * <p>형태
 * <pre>
 *   dailyCommits: {"2026-08-03":[2,7],"2026-08-02":[0,3]}   키=날짜, 값=[공개, 비공개]
 *   languages:    {"TypeScript":812340,"Java":455210}        키=언어, 값=코드 바이트 수
 * </pre>
 * 커밋이 없는 날은 키가 없다. languages는 비율이 아니라 <b>원본 바이트</b>다 —
 * 상위 N개·최소 비율 같은 표시 규칙을 조회 시점에 적용해야 기준이 바뀌어도 재동기화가 필요 없다.
 *
 * <p>{@link #activeDays}, {@link #totalCommits}는 JSON을 세면 나오는 값이지만 컬럼으로 둔다.
 * 매일 문서를 통째로 다시 쓸 때 계산하면 공짜이고, 덕분에 배지 판정과 랭킹이
 * JSON 파싱 없이 인덱스 조회로 끝난다.
 *
 * <p>MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter가 필요하다.
 */
@Getter
@Setter
@NoArgsConstructor
public class GithubStats {

    private Long userId;
    private String dailyCommits;   // JSON 원문
    private String languages;      // JSON 원문
    private int activeDays;
    private int totalCommits;
    private LocalDate periodFrom;
    private LocalDate periodTo;
    private LocalDateTime updatedAt;

    @Builder
    public GithubStats(Long userId, String dailyCommits, String languages, int activeDays,
                       int totalCommits, LocalDate periodFrom, LocalDate periodTo) {
        this.userId = userId;
        this.dailyCommits = dailyCommits;
        this.languages = languages;
        this.activeDays = activeDays;
        this.totalCommits = totalCommits;
        this.periodFrom = periodFrom;
        this.periodTo = periodTo;
    }
}

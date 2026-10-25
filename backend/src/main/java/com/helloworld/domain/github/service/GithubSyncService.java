package com.helloworld.domain.github.service;

import com.helloworld.domain.github.client.GithubGraphQlClient;
import com.helloworld.domain.github.entity.GithubAccount;
import com.helloworld.domain.github.entity.GithubStats;
import com.helloworld.domain.github.support.GithubStatsCodec;
import com.helloworld.domain.github.support.GithubTokenCipher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

/**
 * GitHub 통계(잔디 + 기술스택) 동기화. 최초 연동 시 1회, 이후 매일 새벽 3시 배치에서 호출된다.
 *
 * <p>이 클래스에는 {@code @Transactional}이 없다. 트랜잭션은 저장 시점에만 필요하고,
 * 그 경계는 {@link GithubStatsWriter}가 갖는다(같은 클래스 내부 호출로는
 * 트랜잭션이 걸리지 않는다는 점 때문이기도 하다).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GithubSyncService {

    private final GithubGraphQlClient graphQlClient;
    private final GithubTokenCipher tokenCipher;
    private final GithubStatsCodec codec;
    private final GithubStatsWriter statsWriter;

    /**
     * GitHub에 요청할 구간의 시작일.
     *
     * <p>오늘까지 포함해 정확히 1년이 되도록 {@code minusYears(1).plusDays(1)} 로 잡는다.
     * "최근 1년 잔디"라는 요구사항 그대로이고, 이보다 길게 잡을 이유도 없다 —
     * 화면이 1년치만 그리므로 더 받아 봐야 저장 용량과 응답 크기만 늘어난다.
     *
     * <p>(GitHub의 {@code contributionsCollection}은 from~to가 1년을 넘으면 에러지만,
     * 클라이언트가 이 구간을 92일짜리 조각으로 나눠 요청하므로 그 제약에 걸릴 일은 없다.
     * 자세한 이유는 {@code GithubGraphQlClient} 주석 참고.)
     */
    public static LocalDate syncFrom(LocalDate today) {
        return today.minusYears(1).plusDays(1);
    }

    /**
     * 화면에 그릴 잔디 격자의 시작일 — 동기화 시작일이 속한 주의 일요일.
     *
     * <p>잔디는 한 열이 일요일~토요일이다. 프론트가 배열을 7개씩 잘라 열을 만드는데,
     * 시작이 일요일이 아니면 모든 열의 요일이 통째로 밀려서 "월요일에 찍힌 커밋이
     * 수요일 칸에 보이는" 상태가 된다. 그래서 격자는 항상 일요일에서 시작한다.
     *
     * <p>이 날짜가 {@link #syncFrom}보다 최대 6일 앞설 수 있는데, 그 며칠은 GitHub 요청
     * 구간 밖이라 값이 없다. 응답 조립 단계에서 0으로 채워진다.
     */
    public static LocalDate gridFrom(LocalDate today) {
        return syncFrom(today).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
    }

    /**
     * 토큰 주인의 신원 + 최근 1년 커밋 + 언어별 코드량을 GitHub에서 받아온다. (저장하지 않는다)
     *
     * <p>GraphQL 1회 호출로 셋이 함께 온다. 최초 연동은 이 신원으로 계정을 만들어야 하므로
     * 조회와 저장을 분리해 뒀다.
     */
    public GithubGraphQlClient.GithubSnapshot fetchSnapshot(String accessToken, LocalDate today) {
        return graphQlClient.fetchSnapshot(accessToken, syncFrom(today), today);
    }

    /**
     * 받아온 스냅샷을 통계 문서로 만들어 저장한다.
     *
     * <p>{@code activeDays}(커밋한 날 수)와 {@code totalCommits}는 JSON을 세면 나오는 값이지만
     * 여기서 계산해 컬럼으로 함께 넣는다. 어차피 문서를 만드는 김에 세는 것이라 공짜이고,
     * 덕분에 배지 판정과 랭킹이 JSON 파싱 없이 인덱스 조회로 끝난다.
     *
     * <p>언어는 <b>원본 바이트 그대로</b> 저장한다. 비율·상위 N개·최소 비율 같은 표시 규칙은
     * 조회 시점에 적용해야 기준을 바꿔도 전 사용자 재동기화가 필요 없다.
     *
     * <p>사용자가 GitHub 계정명을 바꿨을 수 있으므로 응답의 login으로 함께 갱신한다.
     * (조회는 {@code viewer}라 저장된 login이 낡아도 동기화가 깨지지는 않는다.)
     */
    public void saveSnapshot(Long userId, GithubGraphQlClient.GithubSnapshot snapshot,
                             LocalDate today) {
        int totalCommits = snapshot.dailyCommits().values().stream()
                .mapToInt(c -> c.publicCount() + c.privateCount())
                .sum();

        GithubStats stats = GithubStats.builder()
                .userId(userId)
                .dailyCommits(codec.encodeDailyCommits(snapshot.dailyCommits()))
                .languages(codec.encodeLanguages(snapshot.languages()))
                // 커밋이 없는 날은 항목이 없으므로, 항목 수가 곧 커밋한 날 수다.
                .activeDays(snapshot.dailyCommits().size())
                .totalCommits(totalCommits)
                .periodFrom(gridFrom(today))
                .periodTo(today)
                .build();

        statsWriter.replace(stats, snapshot.login());

        log.info("GitHub 동기화 완료 - userId={}, login={}, 활동일수={}, 총커밋={}, 언어={}종",
                userId, snapshot.login(), stats.getActiveDays(), totalCommits,
                snapshot.languages().size());
    }

    /** 저장된 계정의 토큰으로 조회 후 저장까지. 새벽 배치가 쓰는 경로. */
    public void sync(GithubAccount account, LocalDate today) {
        String accessToken = tokenCipher.decrypt(account.getAccessToken());
        saveSnapshot(account.getUserId(), fetchSnapshot(accessToken, today), today);
    }
}

package com.helloworld.domain.github.service;

import com.helloworld.domain.github.client.GithubGraphQlClient;
import com.helloworld.domain.github.client.GithubOAuthClient;
import com.helloworld.domain.github.dto.response.GithubConnectResponse;
import com.helloworld.domain.github.dto.response.GithubContributionResponse;
import com.helloworld.domain.github.entity.GithubAccount;
import com.helloworld.domain.github.entity.GithubStats;
import com.helloworld.domain.github.mapper.GithubMapper;
import com.helloworld.domain.github.support.GithubStatsCodec;
import com.helloworld.domain.github.support.GithubTokenCipher;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

/**
 * GitHub 연동 · 잔디 조회 비즈니스 로직.
 *
 * <p>조회(GET)는 GitHub을 호출하지 않고 DB만 읽는다. 프로필은 남의 것까지 자주 열리는 화면이라
 * 조회마다 GitHub을 부르면 (1) 응답이 GitHub 왕복만큼 느려지고 (2) 레이트리밋을 열람
 * 트래픽이 먹어버려 정작 밤 배치가 실패한다.
 *
 * <p>쓰기 트랜잭션은 {@link GithubAccountWriter} / {@link GithubStatsWriter}가 갖는다.
 * 이 클래스는 외부 호출과 순서를 조율하는 역할만 하고, 외부 호출이 트랜잭션 안에 들어가지 않게 한다.
 */
@Service
@RequiredArgsConstructor
public class GithubService {

    private final GithubMapper githubMapper;
    private final GithubOAuthClient oAuthClient;
    private final GithubTokenCipher tokenCipher;
    private final GithubStatsCodec codec;
    private final GithubSyncService syncService;
    private final GithubAccountWriter accountWriter;

    /**
     * GitHub 계정을 연동하고 최근 1년 커밋을 적재한다.
     *
     * <p>흐름: 토큰 확보 → viewer 조회(신원 + 1년치 커밋 한 번에) → 중복 검사 → 계정 저장 → 잔디 저장.
     *
     * <p><b>GitHub 조회가 실패하면 연동 전체가 실패한다.</b> 신원(github_id/login)이 잔디와 같은
     * 응답에 실려 오기 때문에, 조회에 실패하면 저장할 계정 정보 자체가 없다. 인가 코드는 1회용이라
     * 재시도하려면 인가 URL부터 다시 타야 하는데, 이미 승인한 앱이면 GitHub이 동의 화면 없이
     * 곧바로 새 코드를 주고 되돌려 보내므로 사용자 입장에서는 버튼을 한 번 더 누르는 정도다.
     *
     * @param code 프론트가 콜백에서 받은 Authorization Code.
     *             비어 있으면 이미 저장된 토큰으로 재동기화만 시도한다.
     */
    public GithubConnectResponse connect(Long userId, String code) {
        Optional<GithubAccount> existing = githubMapper.selectAccountByUserId(userId);

        // 1) 사용할 access token 결정
        String accessToken;
        if (StringUtils.hasText(code)) {
            accessToken = oAuthClient.exchangeCodeForToken(code);
        } else if (existing.isPresent()) {
            // 이미 연동된 계정의 재동기화 요청. 저장된 토큰을 그대로 쓴다.
            accessToken = tokenCipher.decrypt(existing.get().getAccessToken());
        } else {
            throw new BusinessException(ErrorCode.GITHUB_INVALID_CODE, "GitHub 인가 코드가 필요합니다.");
        }

        // 2) 신원 + 1년치 커밋을 한 번에. login은 바뀔 수 있으므로 불변인 databaseId를 식별 정본으로 쓴다.
        LocalDate today = LocalDate.now();
        GithubGraphQlClient.GithubSnapshot snapshot = syncService.fetchSnapshot(accessToken, today);

        // 3) 같은 GitHub 계정을 다른 회원이 이미 붙잡고 있으면 거절 (잔디 도용 방지)
        githubMapper.selectAccountByGithubId(snapshot.githubId())
                .filter(owner -> !owner.getUserId().equals(userId))
                .ifPresent(owner -> {
                    throw new BusinessException(ErrorCode.GITHUB_ALREADY_CONNECTED);
                });

        // 4) 연동 정보 저장 (재연동이면 토큰·사용자명 갱신)
        accountWriter.save(GithubAccount.builder()
                .userId(userId)
                .githubId(snapshot.githubId())
                .githubLogin(snapshot.login())
                .accessToken(tokenCipher.encrypt(accessToken))
                .build());

        // 5) 잔디 적재. 계정이 먼저 저장돼야 FK와 last_synced_at 갱신 대상이 존재한다.
        syncService.saveSnapshot(userId, snapshot, today);

        GithubAccount saved = githubMapper.selectAccountByUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.COMMON_SERVER_ERROR));

        return GithubConnectResponse.builder()
                .githubConnected(true)
                .githubId(saved.getGithubId())
                .githubLogin(saved.getGithubLogin())
                .lastSyncedAt(saved.getLastSyncedAt())
                .build();
    }

    /** 연동 해제. 저장된 토큰과 잔디를 모두 지운다. */
    public void disconnect(Long userId) {
        if (githubMapper.selectAccountByUserId(userId).isEmpty()) {
            throw new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED);
        }
        accountWriter.delete(userId);
    }

    /**
     * 특정 사용자의 최근 1년 잔디 조회. DB만 읽는다.
     *
     * <p>미연동이면 {@code GITHUB_NOT_CONNECTED}(404)를 던진다. 프론트는 이 코드를
     * 오류가 아니라 "연동 안 함"으로 해석해 잔디 영역을 조용히 숨긴다.
     *
     * <p>배지는 저장된 값이 아니라 {@code active_days}에서 계산한다 —
     * 최고 등급만 노출하고 조건 미달 시 회수하는 규칙이라, 배지는 성취 기록이 아니라
     * 현재 데이터에서 파생되는 값이기 때문이다.
     */
    @Transactional(readOnly = true)
    public GithubContributionResponse getContributions(Long targetUserId) {
        GithubAccount account = githubMapper.selectAccountByUserId(targetUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GITHUB_NOT_CONNECTED));

        // 아직 한 번도 동기화가 성공하지 않았으면 통계 문서가 없다.
        // 연동은 됐으므로 404가 아니라 빈 잔디(전부 0)를 돌려준다.
        LocalDate today = LocalDate.now();
        Optional<GithubStats> stats = githubMapper.selectStats(targetUserId);

        if (stats.isEmpty()) {
            return GithubContributionResponse.of(
                    account.getGithubLogin(), account.getLastSyncedAt(),
                    GithubSyncService.gridFrom(today), today,
                    Map.of(), Map.of(), 0);
        }

        GithubStats s = stats.get();
        // 구간은 저장된 값을 그대로 쓴다. 오늘 계산한 구간을 쓰면, 배치가 실패해 문서가 낡았을 때
        // "그 구간의 데이터"라고 거짓말하는 응답이 나간다.
        return GithubContributionResponse.of(
                account.getGithubLogin(), account.getLastSyncedAt(),
                s.getPeriodFrom(), s.getPeriodTo(),
                codec.decodeDailyCommits(s.getDailyCommits()),
                codec.decodeLanguages(s.getLanguages()),
                s.getActiveDays());
    }
}

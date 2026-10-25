package com.helloworld.domain.github.scheduler;

import com.helloworld.domain.github.entity.GithubAccount;
import com.helloworld.domain.github.mapper.GithubMapper;
import com.helloworld.domain.github.service.GithubSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * 매일 새벽 3시 GitHub 잔디 동기화 배치 (API 명세: "최신 정보는 매일 새벽 3시에 갱신").
 *
 * <p><b>순차 처리인 이유</b> — 계정당 GraphQL 1회면 1년치가 다 오므로 호출 수 자체가 적고,
 * GitHub의 secondary rate limit은 "동시 요청 수"에도 걸린다. 병렬로 던지면 요청 총량이
 * 같아도 403으로 막힌다. 계정 1000개여도 순차로 수 분이면 끝나는 규모라 병렬화 이득이 없다.
 *
 * <p><b>한 계정이 실패해도 멈추지 않는다.</b> 토큰을 취소한 사용자 하나 때문에 배치가 중단되면
 * 그 뒤 계정들의 잔디가 통째로 하루 낡은 채 남는다. 실패는 로그만 남기고 다음으로 넘어간다.
 *
 * <p><b>운영 주의</b> — 서버를 여러 대로 늘리면 인스턴스마다 이 배치가 돈다. 저장은 UPSERT라
 * 데이터가 깨지진 않지만 GitHub 호출이 대수만큼 중복되므로, 스케일아웃 시점에
 * 분산 락(Redis)이나 단일 실행 노드 지정이 필요하다.
 * 급하면 {@code APP_GITHUB_SYNC_ENABLED=false} 로 특정 인스턴스에서 끌 수 있다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.github.sync.enabled", havingValue = "true", matchIfMissing = true)
public class GithubSyncScheduler {

    private final GithubMapper githubMapper;
    private final GithubSyncService syncService;

    /** 초 분 시 일 월 요일 — 매일 03:00:00 (서버 타임존 기준). */
    @Scheduled(cron = "0 0 3 * * *")
    public void syncAll() {
        List<GithubAccount> accounts = githubMapper.selectAllAccounts();
        if (accounts.isEmpty()) {
            return;
        }

        // 배치 도중 자정을 넘겨도 모든 계정이 같은 구간으로 저장되도록 날짜를 한 번만 고정한다.
        // (LocalDate.now()를 루프 안에서 부르면 계정마다 구간이 하루씩 달라질 수 있다.)
        LocalDate today = LocalDate.now();

        int success = 0;
        int failure = 0;
        for (GithubAccount account : accounts) {
            try {
                syncService.sync(account, today);
                success++;
            } catch (Exception e) {
                failure++;
                // 토큰 취소·계정 삭제·GitHub 장애 등. 다음 계정으로 계속 진행한다.
                log.warn("GitHub 잔디 동기화 실패 - userId={}, login={}, reason={}",
                        account.getUserId(), account.getGithubLogin(), e.getMessage());
            }
        }
        log.info("GitHub 잔디 동기화 배치 종료 - 대상={}, 성공={}, 실패={}",
                accounts.size(), success, failure);
    }
}

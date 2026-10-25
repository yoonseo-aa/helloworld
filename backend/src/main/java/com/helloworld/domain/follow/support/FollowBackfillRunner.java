package com.helloworld.domain.follow.support;

import com.helloworld.domain.follow.event.FollowEvent;
import com.helloworld.domain.follow.event.FollowEventType;
import com.helloworld.domain.follow.repository.FollowRedisRepository;
import com.helloworld.domain.follow.repository.FollowRedisRepository.FollowingSet;
import com.helloworld.domain.follow.repository.FollowRedisRepository.ScoredMember;
import com.helloworld.domain.follow.service.FollowService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 팔로우 관계 1회성 백필 러너.
 *
 * <p>배경: 팔로우 정본은 Redis(user:following:*)이고 follows 테이블은 SQS 비동기 백업이다.
 * SQS가 꺼져 있던 기간에 생긴 관계는 follows에 없어서, 그 상태에서 Redis 키가 유실되면
 * 캐시 미스 복구(warm)가 "0건"으로 잘못 복원해 관계가 사라진다.
 * 이 러너는 현재 Redis에 있는 모든 팔로우 관계를 follows로 옮겨, 복구원(follows)을 실제로 채운다.
 *
 * <p>안전성:
 * <ul>
 *   <li>{@code app.follow.backfill.enabled=true}일 때만 빈으로 등록된다(기본 false → 평소 배포에 무해).</li>
 *   <li>Redis는 SCAN + 읽기만 한다(상태 변경 없음).</li>
 *   <li>RDB 반영은 정상 경로와 동일한 {@link FollowService#applyFollowEvent}(@Transactional)로 위임한다
 *       — mapper를 직접 부르지 않아 계층 규칙을 지키고, score→시각 변환/INSERT를 재사용한다
 *       (FollowEventWorker와 동일한 방식).</li>
 *   <li>insertFollow는 {@code ON DUPLICATE KEY UPDATE}(upsert)라 여러 번/SQS Worker와 겹쳐 실행해도
 *       행이 중복되지 않고 에러도 없다(멱등).</li>
 *   <li>관계 하나가 실패해도(예: 상대가 users에서 삭제돼 FK 위반) 그 건만 로그로 남기고 건너뛴다
 *       — 부팅 시점 러너라 예외가 전파되면 앱 기동이 실패하므로 per-relation으로 격리한다.</li>
 * </ul>
 *
 * <p>실행 순서: 반드시 SQS를 먼저 켜(신규 변경분이 follows로 흐르게) 놓은 뒤 이 백필을 돌린다.
 * 백필 완료 후에는 플래그를 false로 되돌려 재시작마다 스캔이 도는 것을 막는다.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.follow.backfill.enabled", havingValue = "true")
@RequiredArgsConstructor
public class FollowBackfillRunner implements ApplicationRunner {

    private final FollowRedisRepository followRedis;
    private final FollowService followService;

    @Override
    public void run(ApplicationArguments args) {
        log.info("[follow-backfill] 시작: Redis user:following:* → follows 백필");

        int keys = 0;
        int seen = 0;
        int failed = 0;
        for (FollowingSet set : followRedis.scanAllFollowing()) {
            keys++;
            for (ScoredMember member : set.members()) {
                seen++;
                // 정상 경로(applyFollowEvent) 재사용: score→시각 변환 + upsert. @Transactional 이라 건별 트랜잭션.
                FollowEvent event = new FollowEvent(
                        FollowEventType.FOLLOW, set.followerId(), member.id(), member.score());
                try {
                    followService.applyFollowEvent(event);
                } catch (Exception e) {
                    // 오퍼 1건 실패(예: 상대가 삭제돼 FK 위반)가 전체 백필/앱 기동을 막지 않도록 격리
                    failed++;
                    log.warn("[follow-backfill] 관계 반영 실패로 건너뜀 (follower={}, following={}): {}",
                            set.followerId(), member.id(), e.getMessage());
                }
            }
        }

        log.info("[follow-backfill] 완료: following 키 {}개, 관계 {}건 upsert 시도, 실패 {}건 (SQS Worker가 이미 넣은 건은 자동 무시)",
                keys, seen, failed);
    }
}

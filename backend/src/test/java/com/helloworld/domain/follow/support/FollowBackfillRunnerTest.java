package com.helloworld.domain.follow.support;

import com.helloworld.domain.follow.event.FollowEvent;
import com.helloworld.domain.follow.event.FollowEventType;
import com.helloworld.domain.follow.repository.FollowRedisRepository;
import com.helloworld.domain.follow.repository.FollowRedisRepository.FollowingSet;
import com.helloworld.domain.follow.repository.FollowRedisRepository.ScoredMember;
import com.helloworld.domain.follow.service.FollowService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * FollowBackfillRunner 단위 테스트.
 * Redis 스캔 결과(FollowRedisRepository)와 RDB 반영(FollowService)을 목으로 대체해
 * "Redis의 모든 following 관계를 정상 경로(applyFollowEvent)로 위임" 로직만 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class FollowBackfillRunnerTest {

    @Mock
    private FollowRedisRepository followRedis;
    @Mock
    private FollowService followService;

    @InjectMocks
    private FollowBackfillRunner runner;

    @Test
    @DisplayName("모든 following 관계를 FOLLOW 이벤트로 만들어 applyFollowEvent 에 위임한다")
    void delegatesEveryRelation() {
        long s1 = 1_690_000_000_000L; // 1→2
        long s2 = 1_690_000_001_000L; // 1→3
        long s3 = 1_690_000_002_000L; // 2→3
        given_scan(List.of(
                new FollowingSet(1L, List.of(new ScoredMember(2L, s1), new ScoredMember(3L, s2))),
                new FollowingSet(2L, List.of(new ScoredMember(3L, s3)))
        ));

        runner.run(null);

        // 3개 관계가 각각 (type=FOLLOW, follower, following, occurredAt=score)로 위임되는지 캡처해 확인.
        // occurredAt=score를 그대로 넘겨야 applyFollowEvent 내부 변환이 warm 복구와 round-trip 일치한다.
        ArgumentCaptor<FollowEvent> captor = ArgumentCaptor.forClass(FollowEvent.class);
        verify(followService, times(3)).applyFollowEvent(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(FollowEvent::getType, FollowEvent::getFollowerId,
                        FollowEvent::getFollowingId, FollowEvent::getOccurredAt)
                .containsExactly(
                        tuple(FollowEventType.FOLLOW, 1L, 2L, s1),
                        tuple(FollowEventType.FOLLOW, 1L, 3L, s2),
                        tuple(FollowEventType.FOLLOW, 2L, 3L, s3));
    }

    @Test
    @DisplayName("한 관계 반영이 예외를 던져도(FK 위반 등) 나머지는 계속 위임한다 — 부팅 실패 방지")
    void skipsFailedRelationAndContinues() {
        long s1 = 1_690_000_000_000L;
        long s2 = 1_690_000_001_000L;
        given_scan(List.of(
                new FollowingSet(1L, List.of(new ScoredMember(2L, s1), new ScoredMember(3L, s2)))
        ));
        // 첫 관계(1→2)에서 예외 → 러너가 삼키고 다음(1→3)을 계속 처리해야 한다
        doThrow(new RuntimeException("FK 위반"))
                .when(followService).applyFollowEvent(argFollowing(2L));

        runner.run(null); // 예외가 전파되면 여기서 테스트 실패(=부팅 실패 재현)

        verify(followService, times(2)).applyFollowEvent(any(FollowEvent.class)); // 둘 다 시도됨
    }

    @Test
    @DisplayName("Redis에 관계가 하나도 없으면 아무것도 위임하지 않는다")
    void noRelationsNoDelegation() {
        given_scan(List.of());

        runner.run(null);

        verifyNoInteractions(followService);
    }

    // ===================== helpers =====================

    private void given_scan(List<FollowingSet> sets) {
        org.mockito.BDDMockito.given(followRedis.scanAllFollowing()).willReturn(sets);
    }

    /** followingId가 특정 값인 FOLLOW 이벤트에 매칭되는 Mockito 인자 매처 */
    private FollowEvent argFollowing(long followingId) {
        return org.mockito.ArgumentMatchers.argThat(
                e -> e != null && e.getFollowingId() == followingId);
    }
}

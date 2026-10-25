package com.helloworld.domain.follow.event;

import com.helloworld.domain.follow.service.FollowService;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * SQS 팔로우 이벤트 소비자(Worker). 큐에서 이벤트를 꺼내 follows 테이블에 비동기 반영한다.
 * app.sqs.enabled=true일 때만 등록된다(=SQS 미사용 환경에선 리스너가 뜨지 않아 기동 오류 없음).
 * RDB 접근은 FollowService(@Transactional)를 통해서만 한다(계층 규칙 준수).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.sqs.enabled", havingValue = "true")
@RequiredArgsConstructor
public class FollowEventWorker {

    private final FollowService followService;

    @SqsListener("${app.sqs.follow-queue:helloworld-follow-events}")
    public void handle(FollowEvent event) {
        log.debug("팔로우 이벤트 소비: type={}, {}->{}",
                event.getType(), event.getFollowerId(), event.getFollowingId());
        followService.applyFollowEvent(event);
    }
}

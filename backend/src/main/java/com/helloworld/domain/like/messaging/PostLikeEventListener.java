package com.helloworld.domain.like.messaging;

import com.helloworld.domain.like.service.PostLikeRdbSyncer;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 좋아요 이벤트 Worker.
 * SQS 큐를 폴링하다가 메시지가 오면 Redis(정본)에서 이미 확정된 결과를 RDB에 뒤늦게 반영한다.
 * 실제 반영 로직은 PostLikeRdbSyncer가 갖고 있다 — 동기 폴백 경로와 같은 코드를 쓴다.
 *
 * [스위치] app.sqs.post-like.enabled=true 일 때만 이 Bean이 만들어진다. 기본값은 꺼짐이다.
 *
 *  ⚠️ 이 Worker의 이전 버전은 matchIfMissing = true(설정이 없으면 켜짐)였고, 그게 운영을 내렸다.
 *     리스너가 켜지면 spring-cloud-aws가 기동 시점에 큐 속성을 해석하는데, 기본
 *     QueueNotFoundStrategy가 CREATE라 큐가 없으면 sqs:CreateQueue를 호출한다.
 *     서버 역할에 그 권한이 없어 403이 났다:
 *
 *       Error resolving attributes for queue post-like-events with strategy CREATE
 *         Caused by: SqsException: User: ...AmazonLightsailInstanceRole... is not authorized
 *         to perform: sqs:createqueue ... (403)
 *
 *     큐 해석은 '기동 시점'이라 여기서 실패하면 ApplicationContext가 못 뜨고 프로세스가 종료된다
 *     → 도커 재시작 → 무한 루프(API 502). ElasticMQ 없는 팀원 로컬도 전부 앱이 안 떴다.
 *
 *     이제 세 겹으로 막는다: (1) 기본값 꺼짐, (2) application.yml에 true를 박아두지 않음,
 *     (3) queue-not-found-strategy=fail 로 CreateQueue 자체를 시도하지 않음.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.sqs.post-like.enabled", havingValue = "true")
public class PostLikeEventListener {

    private final PostLikeRdbSyncer rdbSyncer;

    @SqsListener("${app.sqs.post-like.queue:helloworld-post-like-events}")
    public void handle(PostLikeEvent event) {
        log.info("좋아요 이벤트 수신: postId={}, actorUserId={}, liked={}",
                event.postId(), event.actorUserId(), event.liked());

        rdbSyncer.sync(event);
    }
}

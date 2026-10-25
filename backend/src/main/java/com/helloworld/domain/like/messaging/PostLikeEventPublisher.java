package com.helloworld.domain.like.messaging;

import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 좋아요 토글 이벤트를 SQS로 발행한다. (RDB 비동기 반영용)
 *
 * [반환값이 폴백 스위치다] publish()는 "이 이벤트를 Worker가 처리해 줄 것인가"를 boolean으로 알려준다.
 *  false면 호출자(PostLikeService)가 RDB를 동기로 반영한다. 그래서 여기서 예외를 밖으로 던지면 안 된다 —
 *  던지면 폴백도 못 타고 좋아요 API가 500이 된다.
 *
 *  동기 send()를 쓰는 이유: 폴백 여부를 그 자리에서 판단해야 해서 발행 결과를 동기로 알아야 한다.
 *  sendAsync면 성공/실패가 나중에 밝혀져 이미 지나간 폴백 시점을 되돌릴 수 없다.
 *  대기 시간이 길어질 걱정은 두 겹으로 막혀 있다 — 스위치가 꺼져 있으면 SQS를 아예 건드리지 않고,
 *  켜져 있어도 queue-not-found-strategy=fail 이라 없는 큐는 CreateQueue 없이 즉시 실패한다.
 *
 * [스위치가 좋아요 전용인 이유] app.sqs.post-like.enabled 는 팔로우(app.sqs.enabled)와 분리돼 있다.
 *  공유하면 팀이 팔로우 때문에 켰을 때 좋아요 리스너까지 같이 켜지고, 좋아요 큐가 아직 없으면
 *  queue-not-found-strategy=fail 이 기동 시점에 터진다. 한 도메인의 설정 변경이 다른 도메인을
 *  죽이지 않아야 한다는 게 이번 롤백 사고의 교훈이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PostLikeEventPublisher {

    private final ObjectProvider<SqsTemplate> sqsTemplateProvider;

    @Value("${app.sqs.post-like.enabled:false}")
    private boolean enabled;

    @Value("${app.sqs.post-like.queue:helloworld-post-like-events}")
    private String queueName;

    /**
     * @return true면 SQS에 발행됨(Worker가 RDB를 반영한다).
     *         false면 발행하지 않았거나 실패 — 호출자가 RDB를 동기로 반영해야 한다.
     */
    public boolean publish(PostLikeEvent event) {
        if (!enabled) {
            return false;
        }
        SqsTemplate sqsTemplate = sqsTemplateProvider.getIfAvailable();
        if (sqsTemplate == null) {
            log.warn("app.sqs.post-like.enabled=true 이나 SqsTemplate 빈이 없어 동기 반영으로 넘깁니다.");
            return false;
        }
        try {
            sqsTemplate.send(to -> to.queue(queueName).payload(event));
            return true;
        } catch (Exception e) {
            log.warn("좋아요 이벤트 발행 실패 → 동기 반영으로 넘김 (postId={}, actorUserId={}): {}",
                    event.postId(), event.actorUserId(), e.getMessage());
            return false;
        }
    }
}

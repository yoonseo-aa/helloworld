package com.helloworld.domain.like.messaging;

import io.awspring.cloud.sqs.operations.SqsTemplate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 댓글 좋아요 이벤트를 SQS로 발행한다. (comment_likes 비동기 반영용)
 * - app.sqs.enabled=false면 발행을 건너뛴다(로컬 SQS 없이도 Redis 기반 좋아요는 정상 동작).
 * - SqsTemplate은 ObjectProvider로 선택 주입: SQS 자동설정이 없어 빈이 없어도 앱은 정상 기동한다.
 * - sendAsync(논블로킹)로 발행해 좋아요 응답 경로를 막지 않는다. 발행 실패는 로그만(Redis 정본은 이미 반영됨).
 * (FollowEventPublisher와 동일한 배포 안전 패턴. post-like식 SqsTemplate 직접 주입/기본 ON 금지.)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CommentLikeEventPublisher {

    private final ObjectProvider<SqsTemplate> sqsTemplateProvider;

    @Value("${app.sqs.enabled:false}")
    private boolean enabled;

    @Value("${app.sqs.comment-like-queue:comment-like-events}")
    private String queueName;

    public void publish(CommentLikeEvent event) {
        if (!enabled) {
            return;
        }
        SqsTemplate sqsTemplate = sqsTemplateProvider.getIfAvailable();
        if (sqsTemplate == null) {
            log.warn("app.sqs.enabled=true 이나 SqsTemplate 빈이 없어 이벤트 발행을 건너뜁니다.");
            return;
        }
        try {
            sqsTemplate.sendAsync(queueName, event)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.warn("댓글 좋아요 이벤트 발행 실패 (commentId={}, liked={}): {}",
                                    event.getCommentId(), event.isLiked(), ex.getMessage());
                        }
                    });
        } catch (Exception e) {
            log.warn("댓글 좋아요 이벤트 발행 요청 실패 (commentId={}): {}", event.getCommentId(), e.getMessage());
        }
    }
}

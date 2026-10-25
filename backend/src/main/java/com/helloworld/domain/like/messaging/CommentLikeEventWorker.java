package com.helloworld.domain.like.messaging;

import com.helloworld.domain.like.service.CommentLikeService;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * SQS 댓글 좋아요 이벤트 소비자(Worker). 큐에서 이벤트를 꺼내 comment_likes에 비동기 반영한다.
 * app.sqs.enabled=true일 때만 등록된다(matchIfMissing 없음 = SQS 미사용 환경에선 리스너가 뜨지 않아
 * 큐 접속/생성 시도 자체가 없어 기동 오류가 없다 — post-like 크래시의 재발 방지).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.sqs.enabled", havingValue = "true")
@RequiredArgsConstructor
public class CommentLikeEventWorker {

    private final CommentLikeService commentLikeService;

    @SqsListener("${app.sqs.comment-like-queue:comment-like-events}")
    public void handle(CommentLikeEvent event) {
        log.debug("댓글 좋아요 이벤트 소비: commentId={}, actorUserId={}, liked={}",
                event.getCommentId(), event.getActorUserId(), event.isLiked());
        commentLikeService.syncToRdb(event);
    }
}

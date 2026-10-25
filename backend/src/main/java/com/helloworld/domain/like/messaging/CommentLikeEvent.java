package com.helloworld.domain.like.messaging;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 댓글 좋아요 토글 이벤트. Redis 원자적 토글 직후 발행되어 comment_likes 비동기 반영에 쓰인다.
 * SQS JSON 직렬화/역직렬화를 위해 no-arg 생성자 + getter/setter 사용(record 대신 — FollowEvent와 동일 이유).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CommentLikeEvent {

    private Long commentId;
    private Long actorUserId;
    private boolean liked;
}

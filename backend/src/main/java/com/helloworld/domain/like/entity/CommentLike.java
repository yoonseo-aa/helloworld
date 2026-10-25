package com.helloworld.domain.like.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * comment_likes 테이블 매핑 객체.
 * 정본은 Redis(comment:like:users:{commentId})이고, 이 테이블은 SQS Worker(Listener)가
 * 비동기로 채우는 백업/조회용이다. (post_likes ↔ PostLike 와 대칭)
 */
@Getter
@NoArgsConstructor
public class CommentLike {

    private Long commentLikeId;
    private Long commentId;
    private Long userId;
    private LocalDateTime createdAt;

    /** 좋아요 반영 시 채우는 필드만 받는다. (PK/시간은 DB가 채움) */
    @Builder
    public CommentLike(Long commentId, Long userId) {
        this.commentId = commentId;
        this.userId = userId;
    }
}

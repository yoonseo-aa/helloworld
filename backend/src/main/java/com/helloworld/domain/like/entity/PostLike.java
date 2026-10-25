package com.helloworld.domain.like.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * post_likes 테이블 매핑 객체.
 * 정본은 Redis(post:like:users:{postId})이고, 이 테이블은 SQS Worker(Listener)가
 * 비동기로 채우는 백업/조회용 테이블이다(목록 조회에 사용).
 */
@Getter
@NoArgsConstructor
public class PostLike {

    private Long likeId;
    private Long postId;
    private Long userId;
    private LocalDateTime createdAt;

    @Builder
    public PostLike(Long postId, Long userId) {
        this.postId = postId;
        this.userId = userId;
    }
}

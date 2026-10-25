package com.helloworld.domain.like.messaging;

/**
 * 게시물 좋아요 토글 이벤트. Redis 원자적 토글 직후 발행되어
 * RDB(post_likes, posts.like_count) 비동기 반영에 쓰인다.
 */
public record PostLikeEvent(
        Long postId,
        Long actorUserId,
        boolean liked
) {
}

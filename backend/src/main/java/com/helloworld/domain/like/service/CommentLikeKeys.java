package com.helloworld.domain.like.service;

/**
 * 댓글 좋아요 Redis 키 접두어. 쓰기(CommentLikeService)와 읽기(CommentLikeQueryService)가
 * 같은 키를 봐야 하므로 한 곳에 모아 드리프트를 막는다.
 *
 * - {@code comment:like:users:{commentId}} : 좋아요 누른 사용자 Set
 * - {@code comment:like:count:{commentId}} : 좋아요 수 카운터(String, INCR/DECR)
 */
final class CommentLikeKeys {

    static final String USERS_PREFIX = "comment:like:users:";
    static final String COUNT_PREFIX = "comment:like:count:";

    private CommentLikeKeys() {
    }
}

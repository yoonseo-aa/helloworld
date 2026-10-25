package com.helloworld.domain.follow.event;

/** 팔로우 이벤트 종류 (SQS로 발행되어 Worker가 RDB에 반영). */
public enum FollowEventType {
    FOLLOW,
    UNFOLLOW
}

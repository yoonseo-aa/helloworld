package com.helloworld.domain.follow.event;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 팔로우/언팔로우 이벤트. Redis 토글 후 SQS로 발행되고, Worker가 소비해 follows 테이블에 반영한다.
 * SQS JSON 직렬화/역직렬화를 위해 no-arg 생성자 + getter/setter 사용(record 대신).
 * occurredAt은 Redis score와 동일한 팔로우 시각(epoch ms) → RDB created_at과 일치시킨다.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FollowEvent {

    private FollowEventType type;
    private long followerId;   // 거는 사람
    private long followingId;  // 받는 사람
    private long occurredAt;   // 팔로우 시각(epoch ms)
}

package com.helloworld.domain.follow.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 캐시 미스 복구(워밍업) 시 follows 테이블에서 뽑는 관계 projection (MyBatis 매핑용).
 * userId = 상대방 user_id(팔로잉 복구면 following_id, 팔로워 복구면 follower_id),
 * createdAt = 팔로우 시각(ZSET score로 환산). DB snake_case ↔ camelCase 자동 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class FollowRelationRow {

    private Long userId;
    private LocalDateTime createdAt;
}

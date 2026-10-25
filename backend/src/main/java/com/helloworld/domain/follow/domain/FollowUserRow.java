package com.helloworld.domain.follow.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 목록 조회 시 users 테이블에서 뽑는 프로필 projection (MyBatis 매핑용).
 * DB snake_case ↔ camelCase는 map-underscore-to-camel-case로 자동 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class FollowUserRow {

    private Long userId;
    private String nickname;
    private String profileImageUrl;
    private String introduce;      // 목록 각 행의 한줄소개
}

package com.helloworld.domain.follow.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 팔로잉/팔로워 수 조회 응답.
 * 두 필드 중 요청에 맞는 하나만 채우고, 나머지는 null이라 전역 non_null 설정으로 응답에서 생략된다.
 * - 팔로잉 수: { "following_count": 42 }
 * - 팔로워 수: { "follower_count": 17 }
 */
@Getter
@Builder
public class FollowCountResponse {

    private final Long followingCount;
    private final Long followerCount;

    public static FollowCountResponse following(long count) {
        return FollowCountResponse.builder().followingCount(count).build();
    }

    public static FollowCountResponse follower(long count) {
        return FollowCountResponse.builder().followerCount(count).build();
    }
}

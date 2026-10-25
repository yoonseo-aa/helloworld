package com.helloworld.domain.follow.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 팔로우/언팔로우 토글 응답.
 * JSON: { "is_following": true, "follower_count": 18 }
 * - isFollowing은 wrapper Boolean으로 두어 getter가 getIsFollowing()이 되고,
 *   전역 snake_case 직렬화로 "is_following"이 된다. (primitive boolean이면 "following"으로 나가는 함정 회피)
 */
@Getter
@Builder
public class FollowToggleResponse {

    private final Boolean isFollowing;   // 요청 후 팔로우 상태
    private final Long followerCount;    // 대상의 팔로워 수(요청 직후)

    public static FollowToggleResponse of(boolean isFollowing, long followerCount) {
        return FollowToggleResponse.builder()
                .isFollowing(isFollowing)
                .followerCount(followerCount)
                .build();
    }
}

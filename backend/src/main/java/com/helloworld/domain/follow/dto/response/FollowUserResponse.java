package com.helloworld.domain.follow.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 팔로잉/팔로워 목록의 항목. Redis에서 얻은 id에 users 프로필과 뷰어 기준 팔로우 여부를 붙인 것.
 * JSON: { "user_id", "nickname", "profile_image_url", "introduce", "is_following" }
 */
@Getter
@Builder
public class FollowUserResponse {

    private final Long userId;
    private final String nickname;
    private final String profileImageUrl;
    private final String introduce;      // 이름 아래 한줄소개 (모달 목록에서 노출)
    private final Boolean isFollowing;   // 뷰어(로그인 사용자) 기준 팔로우 여부

    public static FollowUserResponse of(Long userId, String nickname, String profileImageUrl,
                                        String introduce, boolean isFollowing) {
        return FollowUserResponse.builder()
                .userId(userId)
                .nickname(nickname)
                .profileImageUrl(profileImageUrl)
                .introduce(introduce)
                .isFollowing(isFollowing)
                .build();
    }
}

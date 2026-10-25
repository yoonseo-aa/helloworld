package com.helloworld.domain.user.dto.response;

import com.helloworld.domain.user.entity.User;
import lombok.Builder;
import lombok.Getter;

/**
 * 회원 응답 DTO. 엔티티를 그대로 노출하지 않고 필요한 필드만.
 * password 등 민감정보는 절대 포함하지 않는다.
 * JSON 직렬화 시 snake_case로 나감 (user_id, profile_image_url ...).
 */
@Getter
@Builder
public class UserResponse {

    private Long userId;
    private String email;
    private String nickname;
    private String profileImageUrl;
    private String introduce;

    public static UserResponse from(User user) {
        return UserResponse.builder()
                .userId(user.getUserId())
                .email(user.getEmail())
                .nickname(user.getNickname())
                .profileImageUrl(user.getProfileImageUrl())
                .introduce(user.getIntroduce())
                .build();
    }
}

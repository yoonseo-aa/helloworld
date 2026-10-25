package com.helloworld.domain.user.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 프로필 생성/설정 응답. 프로필은 별도 테이블이 아니라 users 행이므로 식별자는 user_id.
 * JSON 직렬화 시 snake_case로 나감 (user_id).
 */
@Getter
@Builder
public class ProfileResponse {

    private Long userId;

    public static ProfileResponse of(Long userId) {
        return ProfileResponse.builder()
                .userId(userId)
                .build();
    }
}

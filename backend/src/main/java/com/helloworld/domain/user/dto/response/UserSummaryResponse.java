package com.helloworld.domain.user.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 사용자 최소 정보 (닉네임 카드용). 좋아요 목록·댓글 작성자 등 여러 도메인이 공용으로 쓴다
 * (frontend의 PostAuthor 타입 { user_id, nickname, profile_image_url }과 1:1 대응).
 * UserResponse와 달리 email 등 민감/불필요 정보를 아예 포함하지 않는다
 * (다른 사람이 볼 수 있는 응답이라 최소한만 노출).
 */
@Getter
@Setter
@NoArgsConstructor
public class UserSummaryResponse {

    private Long userId;
    private String nickname;
    private String profileImageUrl;

    public static UserSummaryResponse of(Long userId, String nickname, String profileImageUrl) {
        UserSummaryResponse response = new UserSummaryResponse();
        response.userId = userId;
        response.nickname = nickname;
        response.profileImageUrl = profileImageUrl;
        return response;
    }
}

package com.helloworld.domain.post.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 게시물 작성자 요약 (피드 목록·상세 공용). MyBatis <association>으로 users 조인 결과를 매핑한다.
 * JSON: { "user_id", "nickname", "profile_image_url", "is_following" }
 *
 * <p>is_following은 상세 조회에서만 Service가 채운다. 피드 목록은 null로 두며,
 * 전역 non_null 직렬화 설정으로 응답에서 자동 생략된다.
 */
@Getter
@Setter
@NoArgsConstructor
public class PostAuthorResponse {

    private Long userId;
    private String nickname;
    private String profileImageUrl;
    private Boolean isFollowing;
}

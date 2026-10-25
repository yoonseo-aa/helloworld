package com.helloworld.domain.comment.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 댓글 작성자 요약 정보. 댓글 목록 응답 안에 중첩되어 나간다.
 *
 * MyBatis가 <association>으로 채우므로 기본 생성자 + setter가 필요하다(빌더 전용 클래스로 만들면 매핑 실패).
 * JSON: { "user_id": 1, "nickname": "앨리스", "profile_image_url": null }
 */
@Getter
@Setter
@NoArgsConstructor
public class CommentAuthorResponse {

    private Long userId;
    private String nickname;
    private String profileImageUrl;
}

package com.helloworld.domain.post.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 유저 프로필 하단 3열 썸네일 그리드의 항목 1개 (GET /api/users/{userId}/posts).
 *
 * <p>피드 조회(카드 전문)와 달리 <b>썸네일만</b> 내려주는 경량 응답이다.
 * map-underscore-to-camel-case로 post_id→postId, thumbnail_url→thumbnailUrl, post_type→postType 매핑된다.
 * postId는 다음 페이지 커서로도 쓰인다.
 */
@Getter
@Setter
@NoArgsConstructor
public class UserPostResponse {

    private Long postId;
    private String thumbnailUrl;   // CARD_NEWS는 첫 이미지, 없으면 null
    private String postType;       // PROJECT / CARD_NEWS
}

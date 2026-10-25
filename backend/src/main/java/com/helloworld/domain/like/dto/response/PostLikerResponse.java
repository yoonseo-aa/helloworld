package com.helloworld.domain.like.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 게시물에 좋아요를 누른 사용자 1명 (목록 조회 응답용).
 * MyBatis가 resultType으로 users JOIN 결과를 바로 이 DTO에 매핑한다(단순 조회 전용 프로젝션이라
 * Mapper가 직접 채우도록 Setter를 열어둔다).
 */
@Getter
@Setter
@NoArgsConstructor
public class PostLikerResponse {

    private Long likeId;           // 커서로 쓰는 값 (post_likes.like_id)
    private Long userId;
    private String nickname;
    private String profileImageUrl;
}

package com.helloworld.domain.post.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 게시물 생성 응답. 생성된 게시물 ID만 반환한다.
 * JSON 직렬화 시 snake_case로 나감 (post_id).
 */
@Getter
@Builder
public class PostCreateResponse {

    private Long postId;

    public static PostCreateResponse of(Long postId) {
        return PostCreateResponse.builder()
                .postId(postId)
                .build();
    }
}

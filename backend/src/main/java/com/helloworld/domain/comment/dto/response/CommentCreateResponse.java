package com.helloworld.domain.comment.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 댓글 생성 응답. 생성된 댓글 ID만 반환한다.
 * JSON 직렬화 시 snake_case로 나감 (comment_id).
 */
@Getter
@Builder
public class CommentCreateResponse {

    private Long commentId;

    public static CommentCreateResponse of(Long commentId) {
        return CommentCreateResponse.builder()
                .commentId(commentId)
                .build();
    }
}

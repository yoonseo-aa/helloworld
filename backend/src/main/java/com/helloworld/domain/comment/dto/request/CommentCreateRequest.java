package com.helloworld.domain.comment.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

/**
 * 댓글 생성 요청. 검증은 @Valid로 Controller에서 트리거.
 *
 * post_id는 이 DTO에 두지 않는다 — URL 경로(/api/posts/{postId}/comments)에서 받는다.
 * 작성자 역시 바디가 아니라 인증 토큰(@LoginUserId)에서 온다(클라이언트 조작 방지).
 */
@Getter
public class CommentCreateRequest {

    @NotBlank(message = "댓글 내용은 필수입니다.")
    @Size(max = 1000, message = "댓글은 1000자 이하여야 합니다.")
    private String content;
}

package com.helloworld.domain.comment.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

/**
 * 댓글 수정 요청. 수정 가능한 값은 본문(content)뿐이다.
 * (작성자·게시물은 변경 대상이 아니므로 받지 않는다)
 */
@Getter
public class CommentUpdateRequest {

    @NotBlank(message = "댓글 내용은 필수입니다.")
    @Size(max = 1000, message = "댓글은 1000자 이하여야 합니다.")
    private String content;
}

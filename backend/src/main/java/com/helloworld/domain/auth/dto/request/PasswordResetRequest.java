package com.helloworld.domain.auth.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

/**
 * 비밀번호 재설정 요청. JSON은 snake_case(email)로 들어온다.
 */
@Getter
public class PasswordResetRequest {

    @NotBlank(message = "이메일은 필수입니다.")
    @Email(message = "이메일 형식이 올바르지 않습니다.")
    private String email;
}

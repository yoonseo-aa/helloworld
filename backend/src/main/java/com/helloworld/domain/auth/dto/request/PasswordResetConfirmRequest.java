package com.helloworld.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

/**
 * 비밀번호 재설정 확정 요청. JSON은 snake_case(token, new_password)로 들어온다.
 */
@Getter
public class PasswordResetConfirmRequest {

    @NotBlank(message = "토큰은 필수입니다.")
    private String token;

    @NotBlank(message = "새 비밀번호는 필수입니다.")
    @Size(min = 8, max = 64, message = "비밀번호는 8자 이상 64자 이하여야 합니다.")
    private String newPassword;
}

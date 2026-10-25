package com.helloworld.domain.user.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;

/**
 * 회원 생성 요청. 검증은 @Valid로 Controller에서 트리거.
 * 가입 시엔 email+password만 받는다. 닉네임은 이후 '프로필 생성' 단계에서 설정.
 * JSON은 snake_case로 들어온다 (email, password). Jackson 전역 설정으로 매핑.
 */
@Getter
public class UserCreateRequest {

    @NotBlank(message = "이메일은 필수입니다.")
    @Email(message = "이메일 형식이 올바르지 않습니다.")
    private String email;

    @NotBlank(message = "비밀번호는 필수입니다.")
    @Size(min = 8, message = "비밀번호는 8자 이상이어야 합니다.")
    private String password;
}

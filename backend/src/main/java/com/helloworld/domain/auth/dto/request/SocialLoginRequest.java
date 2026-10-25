package com.helloworld.domain.auth.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;

/**
 * 소셜 로그인 요청. 프론트가 소셜 인가 화면에서 리다이렉트로 받은 인가 코드를 전달한다.
 * JSON은 snake_case(code, redirect_uri)로 들어온다.
 */
@Getter
public class SocialLoginRequest {

    @NotBlank(message = "인가 코드는 필수입니다.")
    private String code;

    @NotBlank(message = "redirect_uri는 필수입니다.")
    private String redirectUri;   // 인가 요청 시 사용한 redirect URI (구글이 일치 검증)
}

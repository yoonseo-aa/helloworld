package com.helloworld.domain.auth.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 소셜 로그인 응답 바디. Access Token은 바디, Refresh Token은 HttpOnly 쿠키로 나간다.
 * is_new=true면 프론트가 프로필 생성 페이지로, false면 메인 피드로 라우팅.
 * JSON: { "access_token", "token_type", "expires_in", "user_id", "is_new" }
 */
@Getter
@Builder
public class SocialLoginResponse {

    private String accessToken;
    private String tokenType;
    private Long expiresIn;   // Access Token 만료까지 남은 시간(초)
    private Long userId;
    private Boolean isNew;    // 신규 가입 여부

    public static SocialLoginResponse of(String accessToken, long accessTokenValidityMs,
                                         Long userId, boolean isNew) {
        return SocialLoginResponse.builder()
                .accessToken(accessToken)
                .tokenType("Bearer")
                .expiresIn(accessTokenValidityMs / 1000)
                .userId(userId)
                .isNew(isNew)
                .build();
    }
}

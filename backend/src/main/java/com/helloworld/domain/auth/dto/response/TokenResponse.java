package com.helloworld.domain.auth.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 로그인/재발급 응답 바디. Access Token만 내려주고 Refresh는 HttpOnly 쿠키로 전달한다.
 * 로그인 시에는 user(회원 요약)를 포함하고, 재발급 시에는 user 없이(null → 응답에서 생략) 토큰만 내려준다.
 * JSON: { "access_token", "token_type", "expires_in", "user": { "user_id", "email" } }
 */
@Getter
@Builder
public class TokenResponse {

    private String accessToken;
    private String tokenType;
    private Long expiresIn;   // Access Token 만료까지 남은 시간(초)
    private UserInfo user;    // 로그인 시 포함, 재발급 시 null (전역 non_null 설정으로 응답에서 생략)

    /** 응답용 회원 요약. 민감정보(password 등)는 포함하지 않는다. */
    public record UserInfo(Long userId, String email) {}

    /** 재발급용: 토큰만 */
    public static TokenResponse of(String accessToken, long accessTokenValidityMs) {
        return TokenResponse.builder()
                .accessToken(accessToken)
                .tokenType("Bearer")
                .expiresIn(accessTokenValidityMs / 1000)
                .build();
    }

    /** 로그인용: 토큰 + 회원 정보 */
    public static TokenResponse of(String accessToken, long accessTokenValidityMs,
                                   Long userId, String email) {
        return TokenResponse.builder()
                .accessToken(accessToken)
                .tokenType("Bearer")
                .expiresIn(accessTokenValidityMs / 1000)
                .user(new UserInfo(userId, email))
                .build();
    }
}

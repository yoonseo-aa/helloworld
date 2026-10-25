package com.helloworld.domain.auth.controller;

import com.helloworld.domain.auth.dto.request.LoginRequest;
import com.helloworld.domain.auth.dto.request.SocialLoginRequest;
import com.helloworld.domain.auth.dto.response.SocialLoginResponse;
import com.helloworld.domain.auth.dto.response.TokenResponse;
import com.helloworld.domain.auth.service.AuthService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.JwtTokenProvider;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * 인증 API (이메일 로그인 / 토큰 재발급 / 로그아웃). HTTP 요청/응답만 담당한다.
 * - Access Token은 응답 바디(ApiResponse<TokenResponse>)로 전달.
 * - Refresh Token은 HttpOnly 쿠키(Set-Cookie)로 전달하고, 클라이언트 JS에서 접근 불가.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    /** Refresh Token 쿠키 이름 · 경로. 이름은 API 명세서 기준 refreshToken, 경로는 /api/auth로 좁혀 노출 범위를 제한한다. */
    private static final String REFRESH_COOKIE_NAME = "refreshToken";
    private static final String REFRESH_COOKIE_PATH = "/api/auth";

    private final AuthService authService;
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * Refresh 쿠키의 보안 속성. 프로파일에서 조정한다.
     * - 배포(HTTPS): secure=true, SameSite=None  → 크로스오리진 허용
     * - 로컬(http):  secure=false, SameSite=Lax  → 브라우저가 쿠키를 저장/전송하도록
     * 기본값을 배포 기준으로 둬서, 설정을 빼먹어도 운영이 안전한 쪽으로 동작한다.
     */
    @Value("${auth.refresh-cookie.secure:true}")
    private boolean refreshCookieSecure;

    @Value("${auth.refresh-cookie.same-site:None}")
    private String refreshCookieSameSite;

    /** 이메일 로그인 */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<TokenResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        AuthService.LoginResult result = authService.login(request);

        TokenResponse body = TokenResponse.of(
                result.accessToken(), jwtTokenProvider.getAccessTokenValidityMs(),
                result.userId(), result.email());
        ResponseCookie refreshCookie = buildRefreshCookie(
                result.refreshToken(), jwtTokenProvider.getRefreshTokenValidityMs() / 1000);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiResponse.success("로그인에 성공하였습니다.", body));
    }

    /** 소셜 로그인 (구글). 인가 코드로 로그인/자동가입 후 우리 서비스 토큰 발급 */
    @PostMapping("/social/{provider}")
    public ResponseEntity<ApiResponse<SocialLoginResponse>> socialLogin(
            @PathVariable("provider") String provider,
            @Valid @RequestBody SocialLoginRequest request) {
        AuthService.SocialLoginResult result = authService.socialLogin(provider, request);

        SocialLoginResponse body = SocialLoginResponse.of(
                result.accessToken(), jwtTokenProvider.getAccessTokenValidityMs(),
                result.userId(), result.isNew());
        ResponseCookie refreshCookie = buildRefreshCookie(
                result.refreshToken(), jwtTokenProvider.getRefreshTokenValidityMs() / 1000);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
                .body(ApiResponse.success("소셜 로그인에 성공하였습니다.", body));
    }

    /** 토큰 재발급 (Refresh 쿠키로 새 Access 발급) */
    @PostMapping("/reissue")
    public ResponseEntity<ApiResponse<TokenResponse>> reissue(
            @CookieValue(name = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        String accessToken = authService.reissue(refreshToken);
        TokenResponse body = TokenResponse.of(accessToken, jwtTokenProvider.getAccessTokenValidityMs());
        return ResponseEntity.ok(ApiResponse.success("토큰이 재발급되었습니다.", body));
    }

    /** 로그아웃 (Refresh 무효화 + 쿠키 삭제) */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @CookieValue(name = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        authService.logout(refreshToken);

        ResponseCookie expiredCookie = buildRefreshCookie("", 0); // maxAge=0 → 즉시 삭제
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, expiredCookie.toString())
                .body(ApiResponse.success("로그아웃되었습니다."));
    }

    /**
     * Refresh Token 쿠키 생성.
     * secure/sameSite는 프로파일 설정(auth.refresh-cookie.*)에서 주입받는다.
     * HTTPS 배포에서는 secure=true·SameSite=None, 로컬 http에서는 false·Lax를 쓴다.
     */
    private ResponseCookie buildRefreshCookie(String value, long maxAgeSeconds) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, value)
                .httpOnly(true)
                .secure(refreshCookieSecure)
                .sameSite(refreshCookieSameSite)
                .path(REFRESH_COOKIE_PATH)
                .maxAge(Duration.ofSeconds(maxAgeSeconds))
                .build();
    }
}

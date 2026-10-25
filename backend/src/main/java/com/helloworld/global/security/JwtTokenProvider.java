package com.helloworld.global.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 발급/검증. Access Token은 응답 바디로, Refresh Token은 HttpOnly 쿠키로 나간다(공통 규약).
 * secret은 코드에 하드코딩하지 않고 환경변수/프로파일에서 주입.
 *
 * Access/Refresh 모두 subject=userId, role 클레임을 담고, token_use 클레임으로 종류를 구분한다.
 * (인증 필터는 token_use=access 만 받아들여, Refresh 토큰이 Access처럼 쓰이는 것을 막는다.)
 */
@Component
public class JwtTokenProvider {

    private static final String CLAIM_ROLE = "role";
    private static final String CLAIM_TOKEN_USE = "token_use";
    private static final String TOKEN_USE_ACCESS = "access";
    private static final String TOKEN_USE_REFRESH = "refresh";

    private final SecretKey key;
    private final long accessTokenValidityMs;
    private final long refreshTokenValidityMs;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-validity-ms}") long accessTokenValidityMs,
            @Value("${jwt.refresh-token-validity-ms}") long refreshTokenValidityMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenValidityMs = accessTokenValidityMs;
        this.refreshTokenValidityMs = refreshTokenValidityMs;
    }

    public String createAccessToken(Long userId, String role) {
        return createToken(userId, role, TOKEN_USE_ACCESS, accessTokenValidityMs);
    }

    public String createRefreshToken(Long userId, String role) {
        return createToken(userId, role, TOKEN_USE_REFRESH, refreshTokenValidityMs);
    }

    private String createToken(Long userId, String role, String tokenUse, long validityMs) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + validityMs);
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim(CLAIM_ROLE, role)
                .claim(CLAIM_TOKEN_USE, tokenUse)   // access / refresh 구분
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /**
     * 인증 필터용: 토큰을 한 번만 파싱·검증하고, 유효한 Access 토큰이면 LoginUser를 돌려준다.
     * 서명 불일치·만료·형식 오류이거나 Access 토큰이 아니면(=refresh) null.
     */
    public LoginUser parseAccessToken(String token) {
        try {
            Claims claims = parseClaims(token);
            if (!TOKEN_USE_ACCESS.equals(claims.get(CLAIM_TOKEN_USE, String.class))) {
                return null; // Refresh 토큰은 Access로 인정하지 않음
            }
            String role = claims.get(CLAIM_ROLE, String.class);
            if (role == null) {
                return null;
            }
            return new LoginUser(Long.valueOf(claims.getSubject()), role);
        } catch (Exception e) {
            return null;
        }
    }

    public Long getUserId(String token) {
        return Long.valueOf(parseClaims(token).getSubject());
    }

    public String getRole(String token) {
        return parseClaims(token).get(CLAIM_ROLE, String.class);
    }

    /** Refresh 토큰인지 여부 (재발급 엔드포인트에서 Access 토큰 오용 차단용). */
    public boolean isRefreshToken(String token) {
        return TOKEN_USE_REFRESH.equals(parseClaims(token).get(CLAIM_TOKEN_USE, String.class));
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean validate(String token) {
        try {
            Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public long getAccessTokenValidityMs() {
        return accessTokenValidityMs;
    }

    public long getRefreshTokenValidityMs() {
        return refreshTokenValidityMs;
    }
}

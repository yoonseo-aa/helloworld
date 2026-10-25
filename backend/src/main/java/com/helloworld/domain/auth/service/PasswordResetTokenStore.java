package com.helloworld.domain.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;

/**
 * 비밀번호 재설정 토큰 저장소 (Redis).
 *
 * <p>토큰 원문은 메일 링크에만 실려 사용자에게 가고, Redis에는 <b>토큰의 SHA-256 해시</b>를 키로
 * 저장한다 — Redis 덤프가 유출돼도 원문 링크를 재구성할 수 없다. TTL 30분, 1회용.
 */
@Component
@RequiredArgsConstructor
public class PasswordResetTokenStore {

    private static final String KEY_PREFIX = "pw:reset:";
    private static final Duration TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RedisTemplate<String, String> redisTemplate;

    /**
     * 재설정 토큰을 발급하고 대상 userId를 Redis에 저장한다(TTL 30분).
     *
     * @return 사용자에게 전달할 토큰 원문(메일 링크에만 실린다)
     */
    public String issue(Long userId) {
        String rawToken = randomToken();
        redisTemplate.opsForValue().set(keyOf(rawToken), String.valueOf(userId), TTL);
        return rawToken;
    }

    /**
     * 토큰을 검증하고 즉시 소비(1회용)한다. GETDEL로 조회+삭제를 원자적으로 처리해 재사용을 막는다.
     *
     * @return 유효하면 userId, 없거나 만료/이미 사용됐으면 null
     */
    public Long consume(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return null;
        }
        String value = redisTemplate.opsForValue().getAndDelete(keyOf(rawToken));
        return (value == null) ? null : Long.valueOf(value);
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 원문이 아니라 SHA-256 해시를 키로 쓴다(유출 방어). */
    private String keyOf(String rawToken) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return KEY_PREFIX + HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 미지원 (표준 JDK엔 항상 존재)", e);
        }
    }
}

package com.helloworld.domain.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Objects;

/**
 * Refresh Token의 서버측 저장소 (Redis 정본).
 * 로그아웃 시 무효화하려면 서버가 유효한 Refresh Token을 알고 있어야 하므로 Redis에 보관한다.
 * key = auth:refresh:{userId}, value = Refresh Token 문자열, TTL = Refresh 유효기간.
 */
@Component
@RequiredArgsConstructor
public class RefreshTokenStore {

    private static final String KEY_PREFIX = "auth:refresh:";

    private final RedisTemplate<String, String> redisTemplate;

    /** 저장(덮어쓰기). 재로그인 시 이전 토큰은 자연스럽게 교체된다. */
    public void save(Long userId, String refreshToken, long validityMs) {
        redisTemplate.opsForValue().set(key(userId), refreshToken, Duration.ofMillis(validityMs));
    }

    /** 저장된 토큰과 일치하는지 확인 (재발급 시 위조/무효화 검증). */
    public boolean matches(Long userId, String refreshToken) {
        String stored = redisTemplate.opsForValue().get(key(userId));
        return stored != null && Objects.equals(stored, refreshToken);
    }

    /** 무효화 (로그아웃). */
    public void delete(Long userId) {
        redisTemplate.delete(key(userId));
    }

    private String key(Long userId) {
        return KEY_PREFIX + userId;
    }
}

package com.helloworld.domain.auth.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/**
 * 비밀번호 재설정 요청 레이트 리밋 (Redis 고정 윈도우).
 *
 * <p>{@code reset-request}는 인증 없는 공개 발송 엔드포인트라, 제한이 없으면 특정 이메일로 반복
 * 요청해 <b>메일 폭탄</b>을 보낼 수 있다. 이메일(정규화 키)당 {@code WINDOW_SECONDS}초에
 * {@code LIMIT}회로 제한한다.
 *
 * <p>INCR과 EXPIRE를 <b>Lua로 원자 처리</b>한다 — 첫 요청(count==1)일 때만 TTL을 걸어 고정 윈도우를
 * 만든다(중간에 죽어 TTL 없는 키가 남는 경합을 없앤다). 좋아요 토글과 같은 Lua 방식.
 */
@Component
@RequiredArgsConstructor
public class PasswordResetRateLimiter {

    private static final String KEY_PREFIX = "pw:reset:rate:";
    private static final int LIMIT = 3;              // 윈도우당 허용 횟수
    private static final int WINDOW_SECONDS = 600;   // 10분

    /** 첫 증가에만 만료를 걸어 고정 윈도우를 유지하고, 현재 카운트를 돌려준다. */
    private static final RedisScript<Long> INCR_WITH_TTL = new DefaultRedisScript<>(
            "local c = redis.call('INCR', KEYS[1]) "
                    + "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end "
                    + "return c",
            Long.class);

    private final RedisTemplate<String, String> redisTemplate;

    /**
     * 요청 1건을 계수하고 허용 여부를 반환한다. 한도를 넘으면 {@code false}.
     * 초과 요청도 계수는 되지만(카운트만 증가) TTL은 첫 요청 기준으로 유지돼 윈도우가 밀리지 않는다.
     */
    public boolean tryAcquire(String email) {
        String key = KEY_PREFIX + email.trim().toLowerCase(Locale.ROOT);
        Long count = redisTemplate.execute(INCR_WITH_TTL, List.of(key), String.valueOf(WINDOW_SECONDS));
        return count != null && count <= LIMIT;
    }
}

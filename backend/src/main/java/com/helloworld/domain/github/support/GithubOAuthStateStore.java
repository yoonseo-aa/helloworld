package com.helloworld.domain.github.support;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

/**
 * GitHub OAuth의 {@code state} 저장소 (Redis).
 *
 * <p><b>왜 필요한가</b> — GitHub은 승인이 끝나면 <b>사용자의 브라우저를</b> 콜백 주소로 보낸다.
 * 브라우저의 top-level 이동이라 {@code Authorization} 헤더가 실리지 않고, 그래서 백엔드는
 * 콜백만 봐서는 이 연동이 <b>누구 것인지 알 수 없다</b>.
 *
 * <p>그래서 연동을 시작하는 {@code /authorize} 단계(여긴 JWT가 있다)에서 난수를 만들어
 * {@code state → userId}로 저장해 GitHub에 들려 보내고, 콜백에서 그 난수로 사용자를 복원한다.
 * 물품 보관증과 같은 구조다.
 *
 * <p><b>CSRF 방어도 겸한다</b> — 공격자가 자기 GitHub 계정의 인가 코드를 담아 피해자 브라우저에서
 * 콜백을 호출시키는 공격이 가능한데, 서버가 발급한 적 없는 state는 여기서 걸린다.
 *
 * <p>key = {@code github:oauth:state:{state}}, value = userId, TTL 5분.
 * 소비는 {@code getAndDelete}로 <b>조회와 삭제를 원자적으로</b> 처리해 같은 state를 두 번 쓸 수 없게 한다.
 */
@Component
@RequiredArgsConstructor
public class GithubOAuthStateStore {

    private static final String KEY_PREFIX = "github:oauth:state:";

    /**
     * 인가 화면에서 로그인하고 승인하는 데 걸리는 시간 + 여유.
     * 너무 길면 탈취된 state의 유효 시간이 길어지고, 너무 짧으면 2단계 인증 쓰는 사용자가 실패한다.
     */
    private static final Duration TTL = Duration.ofMinutes(5);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RedisTemplate<String, String> redisTemplate;

    /** 난수 state를 발급하고 userId와 묶어 저장한다. */
    public String issue(Long userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        // URL 쿼리스트링에 그대로 실리므로 URL-safe 인코딩 + 패딩 제거
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        redisTemplate.opsForValue().set(key(state), String.valueOf(userId), TTL);
        return state;
    }

    /**
     * state로 userId를 복원하고 <b>즉시 폐기</b>한다(일회용).
     *
     * <p>없거나 이미 쓰인 state면 비어 있는 값이 돌아온다. 조회 후 따로 delete를 부르는 방식이면
     * 그 사이에 같은 state로 두 번 들어온 요청이 모두 통과할 수 있어, 원자적 연산을 쓴다.
     */
    public Optional<Long> consume(String state) {
        if (!StringUtils.hasText(state)) {
            return Optional.empty();
        }
        String userId = redisTemplate.opsForValue().getAndDelete(key(state));
        if (userId == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.valueOf(userId));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private String key(String state) {
        return KEY_PREFIX + state;
    }
}

package com.helloworld.domain.post.summary.support;

import com.helloworld.domain.post.summary.entity.RepoSummary;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.util.Optional;

/**
 * 미리보기로 만든 요약을 게시물 저장 시점까지 보관한다. (Redis)
 *
 * <p><b>왜 필요한가</b> — 요약은 작성자가 저장소를 고르는 순간 만들어지고, 게시물은 그보다
 * 나중에 저장된다. 그 사이 값을 어디엔가 들고 있어야 하는데, 프론트가 받아뒀다가 그대로
 * 되돌려보내는 방식은 <b>사용자가 고칠 수도 없는 값을 왕복시키는 낭비</b>이고
 * 그 과정에서 조작 가능성만 생긴다. 서버가 들고 있으면 둘 다 사라진다.
 *
 * <p>같은 저장소로 LLM을 두 번 부르지 않는 것도 목적이다. 비용이 두 배가 될 뿐 아니라,
 * 두 결과가 달라서 <b>사용자가 본 요약과 저장된 요약이 어긋난다.</b>
 *
 * <p>key = {@code post:summary:{userId}:{owner/repo}}
 *
 * <p><b>왜 userId를 키에 넣는가</b> — 넣지 않으면 A가 미리 본 요약을 B가 자기 게시물에
 * 쓰게 된다. 저장소가 공개라 내용 자체는 문제없지만, "내가 고른 저장소의 요약"이라는
 * 전제가 깨지면 추적이 어려워진다.
 *
 * <p><b>TTL이 1시간인 이유</b> — 저장소를 고른 뒤 본문을 쓰는 시간이다. 짧으면 글을
 * 오래 쓴 사용자의 요약이 사라지고, 길면 Redis에 쓸모없는 값이 쌓인다. 만료되면
 * 요약 없이 저장된다 — 게시물 작성을 5~15초 멈추면서까지 다시 만들 이유는 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RepoSummaryCache {

    private static final String KEY_PREFIX = "post:summary:";
    private static final Duration TTL = Duration.ofHours(1);

    private final RedisTemplate<String, String> redisTemplate;
    private final RepoSummaryCodec codec;

    public void put(Long userId, String repoFullName, RepoSummary summary) {
        String json = codec.encode(summary);
        if (json == null) {
            return;
        }
        try {
            redisTemplate.opsForValue().set(key(userId, repoFullName), json, TTL);
        } catch (Exception e) {
            // 캐시 실패로 미리보기 응답까지 실패시킬 이유는 없다. 화면에는 요약이 보이고,
            // 저장 시점에만 비어 있게 된다.
            log.warn("요약 캐시 저장 실패 - userId={}, repo={}", userId, repoFullName, e);
        }
    }

    /**
     * 저장할 요약을 꺼낸다.
     *
     * <p><b>지우지 않는다.</b> 사용자가 게시물 작성에 실패해 다시 시도할 수 있고,
     * 그때 요약이 사라져 있으면 이유를 알 수 없다. TTL이 알아서 정리한다.
     */
    public Optional<RepoSummary> get(Long userId, String repoFullName) {
        try {
            String json = redisTemplate.opsForValue().get(key(userId, repoFullName));
            return StringUtils.hasText(json) ? codec.decode(json) : Optional.empty();
        } catch (Exception e) {
            log.warn("요약 캐시 조회 실패 - userId={}, repo={}", userId, repoFullName, e);
            return Optional.empty();
        }
    }

    private String key(Long userId, String repoFullName) {
        return KEY_PREFIX + userId + ":" + repoFullName;
    }
}

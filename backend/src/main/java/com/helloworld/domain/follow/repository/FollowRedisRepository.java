package com.helloworld.domain.follow.repository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.DefaultTypedTuple;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 팔로우 관계의 정본(Redis ZSET) 접근 컴포넌트.
 * - 키: user:following:{id}(내가 팔로우하는 사람) / user:followers:{id}(나를 팔로우하는 사람)
 * - member = 상대 user_id, score = 팔로우 시각(epoch ms) → 최신순 커서 페이징 가능
 * - 토글은 Lua 스크립트로 두 ZSET을 원자적으로 갱신한다.
 */
@Slf4j
@Repository
@RequiredArgsConstructor
public class FollowRedisRepository {

    private static final String FOLLOWING_KEY = "user:following:"; // 내가 팔로우하는 사람들
    private static final String FOLLOWERS_KEY = "user:followers:"; // 나를 팔로우하는 사람들

    // "빈 관계" 표식(sentinel). 관계 0건이면 ZSET 키를 만들 수 없어 캐시 미스 판별이 매번 DB로 샌다.
    // "최근 확인했더니 0건"을 짧은 TTL 표식으로 남겨 그동안 DB 재조회를 건너뛴다. 상태 변경(팔로우) 시 삭제한다.
    // ⚠️ 정본 ZSET(user:following:/user:followers:)과 별도 네임스페이스(follow:empty:)를 쓴다.
    //    같은 접두사면 user:following:* 스캔(피드 열거·운영 툴)에 섞여 오염되므로 분리한다.
    private static final String FOLLOWING_EMPTY_KEY = "follow:empty:following:";
    private static final String FOLLOWERS_EMPTY_KEY = "follow:empty:followers:";
    private static final Duration EMPTY_MARK_TTL = Duration.ofMinutes(5);

    private final RedisTemplate<String, String> redisTemplate;

    // 팔로우: 양쪽 ZSET에 원자적으로 추가(NX=이미 있으면 기존 유지) 후 [added, 대상 팔로워 수] 반환
    private static final RedisScript<List> FOLLOW_SCRIPT = new DefaultRedisScript<>("""
            local added = redis.call('ZADD', KEYS[1], 'NX', ARGV[3], ARGV[1])
            redis.call('ZADD', KEYS[2], 'NX', ARGV[3], ARGV[2])
            return {added, redis.call('ZCARD', KEYS[2])}
            """, List.class);

    // 언팔로우: 양쪽 ZSET에서 제거(hard delete) 후 [removed, 대상 팔로워 수] 반환
    private static final RedisScript<List> UNFOLLOW_SCRIPT = new DefaultRedisScript<>("""
            local removed = redis.call('ZREM', KEYS[1], ARGV[1])
            redis.call('ZREM', KEYS[2], ARGV[2])
            return {removed, redis.call('ZCARD', KEYS[2])}
            """, List.class);

    // 목록: max("+inf" 또는 "(score")부터 -inf까지 최신순 count개를 (member, score) 평면 배열로 반환
    private static final RedisScript<List> LIST_SCRIPT = new DefaultRedisScript<>("""
            return redis.call('ZREVRANGEBYSCORE', KEYS[1], ARGV[1], '-inf', 'WITHSCORES', 'LIMIT', 0, ARGV[2])
            """, List.class);

    // 뷰어 기준 각 대상의 팔로우 여부(1/0)를 배치로 반환
    private static final RedisScript<List> IS_FOLLOWING_SCRIPT = new DefaultRedisScript<>("""
            local res = {}
            for i = 1, #ARGV do
                if redis.call('ZSCORE', KEYS[1], ARGV[i]) then res[i] = 1 else res[i] = 0 end
            end
            return res
            """, List.class);

    /** A(follower)가 B(following)를 팔로우 */
    public ToggleResult follow(long followerId, long followingId, long score) {
        List<?> r = redisTemplate.execute(FOLLOW_SCRIPT,
                List.of(FOLLOWING_KEY + followerId, FOLLOWERS_KEY + followingId),
                String.valueOf(followingId), String.valueOf(followerId), String.valueOf(score));
        return toToggleResult(r);
    }

    /** A(follower)가 B(following)를 언팔로우 */
    public ToggleResult unfollow(long followerId, long followingId) {
        List<?> r = redisTemplate.execute(UNFOLLOW_SCRIPT,
                List.of(FOLLOWING_KEY + followerId, FOLLOWERS_KEY + followingId),
                String.valueOf(followingId), String.valueOf(followerId));
        return toToggleResult(r);
    }

    /** user:following:{userId} 키 존재 여부. 캐시 미스(키 없음)와 진짜 0명(키 있고 ZCARD=0)을 구분한다. */
    public boolean existsFollowing(long userId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(FOLLOWING_KEY + userId));
    }

    /** user:followers:{userId} 키 존재 여부. */
    public boolean existsFollowers(long userId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(FOLLOWERS_KEY + userId));
    }

    /** 캐시 미스 복구: DB에서 읽은 (id, score) 목록으로 user:following:{userId} ZSET을 재적재한다. */
    public void warmFollowing(long userId, List<ScoredMember> members) {
        warm(FOLLOWING_KEY + userId, members);
    }

    /** 캐시 미스 복구: user:followers:{userId} ZSET을 재적재한다. */
    public void warmFollowers(long userId, List<ScoredMember> members) {
        warm(FOLLOWERS_KEY + userId, members);
    }

    private void warm(String key, List<ScoredMember> members) {
        if (members.isEmpty()) {
            return; // 빈 세트는 Redis에 키를 만들 수 없다(ZSET은 원소 0개면 키 미존재) → DB에 관계가 없다는 뜻
        }
        Set<ZSetOperations.TypedTuple<String>> tuples = new HashSet<>();
        for (ScoredMember m : members) {
            tuples.add(new DefaultTypedTuple<>(String.valueOf(m.id()), (double) m.score()));
        }
        redisTemplate.opsForZSet().add(key, tuples);
    }

    // --- "빈 관계" 표식(sentinel): 0건 유저의 매 요청 DB 재조회를 TTL 동안 차단 ---

    public boolean isFollowingEmptyMarked(long userId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(FOLLOWING_EMPTY_KEY + userId));
    }

    public boolean isFollowersEmptyMarked(long userId) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(FOLLOWERS_EMPTY_KEY + userId));
    }

    public void markFollowingEmpty(long userId) {
        redisTemplate.opsForValue().set(FOLLOWING_EMPTY_KEY + userId, "1", EMPTY_MARK_TTL);
    }

    public void markFollowersEmpty(long userId) {
        redisTemplate.opsForValue().set(FOLLOWERS_EMPTY_KEY + userId, "1", EMPTY_MARK_TTL);
    }

    /** 팔로우로 관계가 생겨 더는 0건이 아닐 때 표식을 제거한다(오래된 표식이 잘못된 0을 반환하지 않도록). */
    public void clearFollowingEmpty(long userId) {
        redisTemplate.delete(FOLLOWING_EMPTY_KEY + userId);
    }

    public void clearFollowersEmpty(long userId) {
        redisTemplate.delete(FOLLOWERS_EMPTY_KEY + userId);
    }

    public long countFollowing(long userId) {
        Long c = redisTemplate.opsForZSet().zCard(FOLLOWING_KEY + userId);
        return c == null ? 0L : c;
    }

    public long countFollowers(long userId) {
        Long c = redisTemplate.opsForZSet().zCard(FOLLOWERS_KEY + userId);
        return c == null ? 0L : c;
    }

    public List<ScoredMember> listFollowing(long userId, Long cursor, int count) {
        return list(FOLLOWING_KEY + userId, cursor, count);
    }

    public List<ScoredMember> listFollowers(long userId, Long cursor, int count) {
        return list(FOLLOWERS_KEY + userId, cursor, count);
    }

    /** user:following:{userId} ZSET의 모든 대상 id(내가 팔로우하는 전원). 메인 피드 조회용(전체 멤버 필요). */
    public List<Long> followingIds(long userId) {
        Set<String> members = redisTemplate.opsForZSet().range(FOLLOWING_KEY + userId, 0, -1);
        List<Long> ids = new ArrayList<>();
        if (members != null) {
            for (String member : members) {
                try {
                    ids.add(Long.parseLong(member));
                } catch (NumberFormatException e) {
                    // 비정상 멤버 하나가 피드 조회 전체를 500으로 죽이지 않도록 격리(scanAllFollowing과 동일 정책).
                    log.warn("[feed] user:following:{}의 비정상 멤버 건너뜀: {}", userId, member);
                }
            }
        }
        return ids;
    }

    private List<ScoredMember> list(String key, Long cursor, int count) {
        String max = (cursor == null) ? "+inf" : "(" + cursor; // 커서는 exclusive(직전 마지막 다음부터)
        List<?> flat = redisTemplate.execute(LIST_SCRIPT, List.of(key), max, String.valueOf(count));
        List<ScoredMember> result = new ArrayList<>();
        if (flat == null) {
            return result;
        }
        for (int i = 0; i + 1 < flat.size(); i += 2) {
            long id = Long.parseLong(String.valueOf(flat.get(i)));
            long score = (long) Double.parseDouble(String.valueOf(flat.get(i + 1)));
            result.add(new ScoredMember(id, score));
        }
        return result;
    }

    /** 뷰어(viewerId)가 target 한 명을 팔로우 중인지 (ZSCORE not null) */
    public boolean isFollowing(long viewerId, long targetId) {
        Double score = redisTemplate.opsForZSet()
                .score(FOLLOWING_KEY + viewerId, String.valueOf(targetId));
        return score != null;
    }

    /** 뷰어(viewerId)가 targetIds 각각을 팔로우하는지 (입력 순서와 동일한 순서로 반환) */
    public List<Boolean> isFollowing(long viewerId, List<Long> targetIds) {
        Object[] args = targetIds.stream().map(String::valueOf).toArray();
        List<?> r = redisTemplate.execute(IS_FOLLOWING_SCRIPT, List.of(FOLLOWING_KEY + viewerId), args);
        List<Boolean> result = new ArrayList<>();
        if (r == null) {
            return result;
        }
        for (Object o : r) {
            result.add(o != null && Long.parseLong(String.valueOf(o)) == 1L);
        }
        return result;
    }

    /**
     * 백필용: 모든 user:following:{id} ZSET을 스캔해 (follower_id, [following members]) 목록으로 반환한다.
     * following 키만 훑어도 모든 팔로우 관계가 복원된다(followers 키는 그 역방향 중복이라 불필요).
     * empty 마커는 follow:empty:* 네임스페이스라 이 패턴 스캔에 섞이지 않는다.
     * KEYS 대신 SCAN을 써서 대량 키에도 Redis를 블로킹하지 않는다.
     */
    public List<FollowingSet> scanAllFollowing() {
        List<FollowingSet> result = new ArrayList<>();
        ScanOptions options = ScanOptions.scanOptions().match(FOLLOWING_KEY + "*").count(500).build();
        try (Cursor<String> cursor = redisTemplate.scan(options)) {
            while (cursor.hasNext()) {
                String key = cursor.next();
                try {
                    long followerId = Long.parseLong(key.substring(FOLLOWING_KEY.length()));
                    Set<ZSetOperations.TypedTuple<String>> tuples =
                            redisTemplate.opsForZSet().rangeWithScores(key, 0, -1);
                    List<ScoredMember> members = new ArrayList<>();
                    if (tuples != null) {
                        for (ZSetOperations.TypedTuple<String> t : tuples) {
                            if (t.getValue() == null || t.getScore() == null) {
                                continue;
                            }
                            members.add(new ScoredMember(Long.parseLong(t.getValue()), t.getScore().longValue()));
                        }
                    }
                    result.add(new FollowingSet(followerId, members));
                } catch (RuntimeException e) {
                    // 예외적 키(비정상 suffix/member 등) 하나가 전체 스캔을 중단시키지 않도록 격리
                    log.warn("[follow-backfill] following 키 파싱 실패로 건너뜀 (key={}): {}", key, e.getMessage());
                }
            }
        }
        return result;
    }

    private ToggleResult toToggleResult(List<?> r) {
        long changed = Long.parseLong(String.valueOf(r.get(0)));
        long followerCount = Long.parseLong(String.valueOf(r.get(1)));
        return new ToggleResult(changed > 0, followerCount);
    }

    /** changed = 실제 상태 변화 여부(신규 팔로우/실제 언팔로우), followerCount = 대상 팔로워 수 */
    public record ToggleResult(boolean changed, long followerCount) {}

    /** ZSET 원소 하나: id = 상대 user_id, score = 팔로우 시각(epoch ms) */
    public record ScoredMember(long id, long score) {}

    /** 백필용: 한 follower(user:following:{followerId})가 팔로우하는 대상 목록 */
    public record FollowingSet(long followerId, List<ScoredMember> members) {}
}

package com.helloworld.domain.like.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 게시물 좋아요 <b>읽기 전용</b> 조회 서비스. 메인 피드/상세가 각 게시물의 {@code is_liked}/{@code like_count}를
 * Redis 정본에서 배치로 읽을 때 쓴다. ({@link CommentLikeQueryService}의 게시물 버전.)
 *
 * <p>Redis 키(아키텍처 설계서 2장): {@code post:like:count:{post_id}}(String), {@code post:like:users:{post_id}}(Set).
 *
 * <p>게시물 좋아요 <b>쓰기</b>(토글 + SQS 워커)는 운영에서 정상 동작한다. 한때 운영 크래시로
 * revert된 적이 있어 "키가 비어 있어 like_count=0으로 나온다"는 설명이 이 자리에 남아 있었는데,
 * 배포 안전 패턴으로 다시 올라간 뒤로는 맞지 않는 이야기다(2026-08-06 운영에서 동시 10건 요청 →
 * Redis 카운트·RDB 행 모두 10건 확인).
 *
 * <p><b>알려진 공백</b>: 캐시 미스와 "정말 좋아요 0건"을 구분하지 않는다. 아래 스크립트는 카운트 키가
 * 없으면 0으로 보고, 팔로우의 {@code ensureFollowingWarm}처럼 RDB({@code post_likes})를 읽어
 * Redis를 다시 채우는 복구 경로가 없다. 그래서 Redis 데이터가 사라지면 행이 남아 있어도
 * 좋아요 수가 0으로 보이고 스스로 회복되지 않는다.
 * <ul>
 *   <li>실제 리스크는 낮다 — 운영 Redis는 AOF가 켜져 있고({@code appendonly yes},
 *       {@code appendfsync everysec}, 커맨드에 박혀 재기동에도 유지) {@code /data}가 named volume이라
 *       재기동·크래시·컨테이너 재생성에도 데이터가 남는다. 볼륨을 명시적으로 지우거나 AOF가
 *       손상되는 경우에만 문제가 된다.</li>
 *   <li>댓글 좋아요({@link CommentLikeQueryService})가 완전히 같은 공백을 갖는다. 복구 러너를 만들 때는
 *       게시물·댓글 공통으로 하나만 만들면 된다. 백로그: S15P11E204-265</li>
 * </ul>
 * ({@code FollowBackfillRunner}는 방향이 반대(Redis → RDB)라 이 문제와 별개다)
 */
@Service
@RequiredArgsConstructor
public class PostLikeQueryService {

    private static final String LIKE_USERS_KEY_PREFIX = "post:like:users:";
    private static final String LIKE_COUNT_KEY_PREFIX = "post:like:count:";

    /**
     * 여러 게시물의 (좋아요 여부, 좋아요 수)를 한 번에 읽는다.
     * KEYS = [users:p1, count:p1, users:p2, count:p2, ...], ARGV[1] = 조회자 userId.
     * 반환은 평면 배열 [liked0, count0, liked1, count1, ...]. 없는 카운트 키는 0으로 본다.
     */
    private static final RedisScript<List> BATCH_STATUS_SCRIPT = new DefaultRedisScript<>("""
            local res = {}
            local user = ARGV[1]
            for i = 1, #KEYS, 2 do
                if redis.call('SISMEMBER', KEYS[i], user) == 1 then
                    res[#res + 1] = 1
                else
                    res[#res + 1] = 0
                end
                res[#res + 1] = tonumber(redis.call('GET', KEYS[i + 1])) or 0
            end
            return res
            """, List.class);

    private final RedisTemplate<String, String> redisTemplate;

    /**
     * postIds 각각의 좋아요 상태를 Redis에서 배치로 읽어 {@code postId -> 상태} 맵으로 반환한다.
     *
     * @param postIds     조회할 게시물 id 목록 (비어 있으면 빈 맵)
     * @param loginUserId 조회자 id — is_liked 판단용. null(비로그인)이면 모든 is_liked=false
     */
    public Map<Long, PostLikeStatus> getLikeStatuses(List<Long> postIds, Long loginUserId) {
        Map<Long, PostLikeStatus> result = new HashMap<>();
        if (postIds == null || postIds.isEmpty()) {
            return result;
        }

        List<String> keys = new ArrayList<>(postIds.size() * 2);
        for (Long postId : postIds) {
            keys.add(LIKE_USERS_KEY_PREFIX + postId);
            keys.add(LIKE_COUNT_KEY_PREFIX + postId);
        }
        String viewer = (loginUserId == null) ? "" : String.valueOf(loginUserId);

        @SuppressWarnings("unchecked")
        List<Long> flat = redisTemplate.execute(BATCH_STATUS_SCRIPT, keys, viewer);
        if (flat == null) {
            return result;
        }

        for (int i = 0; i < postIds.size(); i++) {
            boolean liked = numberAt(flat, i * 2) == 1L;
            long likeCount = numberAt(flat, i * 2 + 1);
            result.put(postIds.get(i), new PostLikeStatus(liked, likeCount));
        }
        return result;
    }

    private long numberAt(List<Long> list, int index) {
        if (index >= list.size() || list.get(index) == null) {
            return 0L;
        }
        return ((Number) list.get(index)).longValue();
    }

    /** 한 게시물의 좋아요 표시 상태. */
    public record PostLikeStatus(boolean liked, long likeCount) {
    }
}

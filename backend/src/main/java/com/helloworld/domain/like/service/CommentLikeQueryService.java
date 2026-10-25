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
 * 댓글 좋아요 <b>읽기 전용</b> 조회 서비스. 목록 화면이 각 댓글의 {@code is_liked}/{@code like_count}를
 * Redis 정본에서 배치로 읽을 때 쓴다.
 *
 * <p><b>왜 별도 빈으로 분리했나 (순환참조 방지)</b>
 * <ul>
 *   <li>{@code CommentService.getComments}(목록)가 좋아요 정보를 붙이려면 좋아요 도메인을 호출해야 한다.</li>
 *   <li>읽기 전용을 이 빈으로 떼어내 {@code CommentService → CommentLikeQueryService}(단방향)만 만든다.
 *       이 빈은 Redis만 의존하므로 어느 방향으로도 순환이 생기지 않는다.</li>
 *   <li>원래는 {@code CommentLikeService}가 카운트 갱신 때문에 {@code CommentService}를 의존해서
 *       분리가 <b>필수</b>였다. 그 카운트 갱신은 데드락 때문에 제거됐고(아래) 지금은 의존이 없다.
 *       그래도 읽기/쓰기가 나뉜 구조 자체가 명확해서 그대로 둔다.</li>
 * </ul>
 *
 * <p><b>왜 Redis 정본을 읽나</b>: 카운트/좋아요 여부의 정본은 Redis다.
 * {@code comments.like_count} 컬럼은 <b>더 이상 갱신되지 않는다</b> — {@code comment_likes} INSERT가 잡는
 * FK 공유 락과 물려 데드락이 났고, 읽는 쿼리도 하나도 없어서 갱신을 제거했다
 * (2026-08-06, S15P11E204-264. {@code posts.like_count}와 같은 결론이다). RDB에는 관계 행만 남는다.
 *
 * <p><b>알려진 공백</b>: 캐시 미스와 "정말 좋아요 0건"을 구분하지 않는다(없는 카운트 키 = 0).
 * {@code comment_likes}를 읽어 Redis를 다시 채우는 복구 경로가 없다.
 * 배경·리스크 평가·해결 방향은 {@link PostLikeQueryService} 주석에 정리해 뒀다(같은 공백이다).
 */
@Service
@RequiredArgsConstructor
public class CommentLikeQueryService {

    /**
     * 여러 댓글의 (좋아요 여부, 좋아요 수)를 한 번에 읽는다.
     * KEYS = [users:c1, count:c1, users:c2, count:c2, ...] (댓글마다 두 개씩), ARGV[1] = 조회자 userId.
     * 반환은 평면 배열 [liked0, count0, liked1, count1, ...]. 존재하지 않는 카운트 키는 0으로 본다.
     * (한 번의 왕복 + Lua 원자 실행으로 N개 댓글을 처리 — 파이프라인 대비 라운드트립을 최소화.)
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
     * commentIds 각각의 좋아요 상태를 Redis에서 배치로 읽어 {@code commentId -> 상태} 맵으로 반환한다.
     *
     * @param commentIds  조회할 댓글 id 목록 (비어 있으면 빈 맵)
     * @param loginUserId 조회자 id — is_liked 판단용. null(비로그인)이면 모든 is_liked=false
     */
    public Map<Long, CommentLikeStatus> getLikeStatuses(List<Long> commentIds, Long loginUserId) {
        Map<Long, CommentLikeStatus> result = new HashMap<>();
        if (commentIds == null || commentIds.isEmpty()) {
            return result;
        }

        List<String> keys = new ArrayList<>(commentIds.size() * 2);
        for (Long commentId : commentIds) {
            keys.add(CommentLikeKeys.USERS_PREFIX + commentId);
            keys.add(CommentLikeKeys.COUNT_PREFIX + commentId);
        }
        // 비로그인은 어떤 Set에도 속하지 않는 값을 넘겨 is_liked=false가 되게 한다.
        String viewer = (loginUserId == null) ? "" : String.valueOf(loginUserId);

        @SuppressWarnings("unchecked")
        List<Long> flat = redisTemplate.execute(BATCH_STATUS_SCRIPT, keys, viewer);
        if (flat == null) {
            return result; // 방어적: 스크립트가 값을 못 주면 모두 미조회로 남김(호출부가 0으로 처리)
        }

        for (int i = 0; i < commentIds.size(); i++) {
            boolean liked = numberAt(flat, i * 2) == 1L;
            long likeCount = numberAt(flat, i * 2 + 1);
            result.put(commentIds.get(i), new CommentLikeStatus(liked, likeCount));
        }
        return result;
    }

    private long numberAt(List<Long> list, int index) {
        if (index >= list.size() || list.get(index) == null) {
            return 0L;
        }
        return ((Number) list.get(index)).longValue();
    }

    /** 한 댓글의 좋아요 표시 상태. */
    public record CommentLikeStatus(boolean liked, long likeCount) {
    }
}

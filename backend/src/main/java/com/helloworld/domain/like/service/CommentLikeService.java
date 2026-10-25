package com.helloworld.domain.like.service;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.entity.CommentLike;
import com.helloworld.domain.like.mapper.CommentLikeMapper;
import com.helloworld.domain.like.messaging.CommentLikeEvent;
import com.helloworld.domain.like.messaging.CommentLikeEventPublisher;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 댓글 좋아요 비즈니스 로직. 정본은 Redis, RDB(comment_likes)는 SQS 비동기 백업.
 * (PostLikeService 미러. 단 SQS 발행/소비는 배포 안전한 팔로우 패턴을 따른다.)
 *
 * 토글은 Redis만 즉시 건드려 응답하고, RDB 반영(comment_likes)은 SQS Worker가
 * syncToRdb로 비동기 처리한다. 카운트는 Redis 정본에서 읽으므로 RDB에는 관계 행만 남긴다.
 */
@Service
@RequiredArgsConstructor
public class CommentLikeService {

    private final RedisTemplate<String, String> redisTemplate;
    private final RedisScript<List> toggleLikeScript;
    private final CommentLikeMapper commentLikeMapper;
    private final CommentLikeEventPublisher eventPublisher;

    /**
     * 좋아요 토글 (있으면 취소, 없으면 등록). Redis Lua 스크립트로 원자적 처리.
     * Redis만 즉시 건드리고 결과를 바로 반환하며, RDB 반영은 SQS로 위임한다.
     */
    public LikeToggleResponse toggleLike(Long commentId, Long userId) {
        if (!commentLikeMapper.existsActiveComment(commentId)) {
            throw new BusinessException(ErrorCode.COMMENT_NOT_FOUND);
        }

        String usersKey = CommentLikeKeys.USERS_PREFIX + commentId;
        String countKey = CommentLikeKeys.COUNT_PREFIX + commentId;

        @SuppressWarnings("unchecked")
        List<Long> result = redisTemplate.execute(
                toggleLikeScript,
                List.of(usersKey, countKey),
                String.valueOf(userId));

        boolean liked = numberAt(result, 0) == 1L;
        long likeCount = numberAt(result, 1);

        // RDB 반영은 비동기(SQS)로 위임. 실패해도 사용자 응답(Redis 값)은 이미 확정.
        eventPublisher.publish(new CommentLikeEvent(commentId, userId, liked));

        return LikeToggleResponse.of(liked, likeCount);
    }

    /**
     * Redis 정본을 RDB에 반영한다. SQS Worker가 이벤트를 소비하며 호출.
     * comment_likes는 INSERT IGNORE / hard delete라 중복 이벤트(at-least-once)에도 멱등하다.
     *
     * <p><b>관계 행만 바꾸고 {@code comments.like_count}는 건드리지 않는다.</b>
     * 게시물 좋아요에서 내린 것과 같은 결론이다(PostLikeRdbSyncer 참고).
     * <ul>
     *   <li><b>데드락</b>: comment_likes INSERT는 FK 검사로 comments 행에 공유(S) 락을 잡는다.
     *       이어서 like_count UPDATE가 같은 행의 배타(X) 락을 요구하면 동시 이벤트끼리 물려
     *       데드락이 난다. 게시물 좋아요에서 10건 중 8건을 이렇게 잃었다.
     *       Worker는 여러 스레드로 도니 여기서도 같은 일이 일어난다.</li>
     *   <li><b>읽는 곳이 없다</b>: 화면의 좋아요 수는 Redis 정본에서 온다
     *       ({@link CommentLikeQueryService}). {@code comments.like_count}를 SELECT하는 쿼리는
     *       하나도 없다 — 갱신하다 사고만 나는 컬럼이었다.</li>
     * </ul>
     * 카운트가 RDB에서 필요해지면 그때 행을 센다({@code SELECT COUNT(*) FROM comment_likes ...}).
     * 그 편이 SQS 중복 전달에도 멱등하다.
     */
    @Transactional
    public void syncToRdb(CommentLikeEvent event) {
        if (event.isLiked()) {
            commentLikeMapper.insertLikeIfAbsent(
                    CommentLike.builder()
                            .commentId(event.getCommentId())
                            .userId(event.getActorUserId())
                            .build());
        } else {
            commentLikeMapper.deleteLike(event.getCommentId(), event.getActorUserId());
        }
    }

    private long numberAt(List<Long> list, int index) {
        return ((Number) list.get(index)).longValue();
    }
}

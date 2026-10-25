package com.helloworld.domain.like.service;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.dto.response.LikedPostResponse;
import com.helloworld.domain.like.dto.response.PostLikerResponse;
import com.helloworld.domain.like.mapper.PostLikeMapper;
import com.helloworld.domain.like.messaging.PostLikeEvent;
import com.helloworld.domain.like.messaging.PostLikeEventPublisher;
import com.helloworld.domain.notification.service.NotificationService;
import com.helloworld.domain.post.service.PostService;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.common.CursorResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 게시물 좋아요 비즈니스 로직.
 *
 * [정본은 Redis, RDB는 백업] CLAUDE.md 특수 규칙
 *  - toggleLike()는 Redis를 Lua로 원자적으로 토글하고 "즉시" 결과를 반환한다.
 *  - RDB 반영(post_likes + posts.like_count)은 SQS 이벤트로 넘겨 Worker가 비동기 처리한다.
 *
 * [SQS 폴백] SQS가 아직 배포되지 않은 환경에서도 목록 조회가 동작해야 한다.
 *  목록 조회 두 개(getLikers/getLikedPosts)는 RDB를 읽는데, Redis와 RDB를 잇는 게 SQS Worker다.
 *  SQS가 꺼져 있으면 post_likes에 행이 안 쌓여 목록이 영원히 빈 배열이 된다.
 *  그래서 발행에 실패하면(스위치 off 포함) 같은 반영을 동기로 수행한다.
 *  SQS가 배포되면 환경변수만 켜서 코드 수정 없이 비동기로 전환된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PostLikeService {

    private static final String LIKE_USERS_KEY_PREFIX = "post:like:users:";
    private static final String LIKE_COUNT_KEY_PREFIX = "post:like:count:";

    private final RedisTemplate<String, String> redisTemplate;
    private final RedisScript<List> toggleLikeScript;
    private final PostService postService;
    private final UserService userService;
    private final PostLikeEventPublisher eventPublisher;
    private final PostLikeRdbSyncer rdbSyncer;
    private final PostLikeMapper postLikeMapper;

    /** 좋아요 알림 생성용. 알림 실패가 좋아요를 깨뜨리지 않도록 그쪽에서 예외를 삼킨다 */
    private final NotificationService notificationService;

    /**
     * 좋아요 토글 (있으면 취소, 없으면 등록). Redis Lua 스크립트로 원자적 처리.
     *
     * @param postId 대상 게시물
     * @param userId 요청자 (좋아요를 누르는/취소하는 사람)
     */
    public LikeToggleResponse toggleLike(Long postId, Long userId) {
        // 존재하지 않는 게시물이면 POST_NOT_FOUND.
        // 작성자 id는 알림 대상(recipient)으로 쓴다 — 어차피 조회하는 값이라 추가 쿼리가 없다.
        Long authorId = postService.getPostOrThrow(postId).getUserId();

        String usersKey = LIKE_USERS_KEY_PREFIX + postId;
        String countKey = LIKE_COUNT_KEY_PREFIX + postId;

        @SuppressWarnings("unchecked")
        List<Long> result = redisTemplate.execute(
                toggleLikeScript,
                List.of(usersKey, countKey),
                String.valueOf(userId));

        boolean liked = numberAt(result, 0) == 1L;
        long likeCount = numberAt(result, 1);

        PostLikeEvent event = new PostLikeEvent(postId, userId, liked);

        // 발행됐으면 Worker가 비동기로 반영한다. 못 했으면(스위치 off / 빈 없음 / 발행 실패)
        // 여기서 동기로 반영해 목록 조회가 비지 않게 한다.
        boolean published = eventPublisher.publish(event);
        if (!published) {
            syncFallback(event);
        }

        // 좋아요를 "누른" 경우에만 알림을 만든다. 취소는 알릴 것이 없다.
        // 같은 사람이 취소하고 다시 눌러도 알림 쪽에서 중복을 걸러 한 줄만 남는다.
        // (자기 글에 자기가 누른 경우도 알림 쪽에서 걸러진다)
        if (liked) {
            notificationService.notifyPostLike(authorId, userId, postId);
        }

        return LikeToggleResponse.of(liked, likeCount);
    }

    /**
     * RDB 동기 반영 폴백. 실패해도 예외를 밖으로 던지지 않는다.
     * 좋아요 결과는 Redis에서 이미 확정됐고 사용자에게 돌려줄 값도 정해졌다.
     * 여기서 예외가 나가면 멀쩡히 성공한 좋아요가 500으로 뒤집힌다 — RDB는 백업본일 뿐이다.
     *
     * <p><b>예외 객체를 함께 남기는 이유</b>: 여기서 삼킨 실패는 사용자에게도, 응답에도 드러나지 않는다.
     * 로그가 유일한 흔적이라 원인이 로그에 남지 않으면 사실상 진단이 불가능하다.
     * 실제로 {@code e.getMessage()}만 찍던 동안 데드락 예외의 메시지가 비어 있어서
     * 로그가 "실패 (postId=3, ...): "로 끝났고, InnoDB 상태를 직접 조회해야 원인을 찾을 수 있었다.
     */
    private void syncFallback(PostLikeEvent event) {
        try {
            rdbSyncer.sync(event);
        } catch (Exception e) {
            log.warn("좋아요 RDB 동기 반영 실패 — Redis와 RDB가 어긋난 상태로 남는다 "
                            + "(postId={}, actorUserId={}, liked={})",
                    event.postId(), event.actorUserId(), event.liked(), e);
        }
    }

    /** 게시물에 좋아요 누른 사용자 목록 (RDB 조회, 최신순 커서 페이지네이션). */
    @Transactional(readOnly = true)
    public CursorResponse<PostLikerResponse> getLikers(Long postId, Long cursor, int size) {
        postService.getPostOrThrow(postId); // 존재 확인

        List<PostLikerResponse> fetched = postLikeMapper.selectLikersByPost(postId, cursor, size + 1);
        return CursorResponse.of(fetched, size, PostLikerResponse::getLikeId);
    }

    /** 내가(또는 특정 사용자가) 좋아요한 게시물 목록 (RDB 조회, 좋아요 누른 최신순 커서 페이지네이션). */
    @Transactional(readOnly = true)
    public CursorResponse<LikedPostResponse> getLikedPosts(Long userId, Long cursor, int size) {
        userService.getUser(userId); // 대상 사용자 존재 확인 (없으면 USER_NOT_FOUND)

        List<LikedPostResponse> fetched = postLikeMapper.selectLikedPostsByUser(userId, cursor, size + 1);
        return CursorResponse.of(fetched, size, LikedPostResponse::getLikeId);
    }

    private long numberAt(List<Long> list, int index) {
        return ((Number) list.get(index)).longValue();
    }
}

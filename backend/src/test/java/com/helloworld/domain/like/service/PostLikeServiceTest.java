package com.helloworld.domain.like.service;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.dto.response.LikedPostResponse;
import com.helloworld.domain.like.dto.response.PostLikerResponse;
import com.helloworld.domain.like.mapper.PostLikeMapper;
import com.helloworld.domain.like.messaging.PostLikeEvent;
import com.helloworld.domain.like.messaging.PostLikeEventPublisher;
import com.helloworld.domain.post.entity.Post;
import com.helloworld.domain.notification.service.NotificationService;
import com.helloworld.domain.post.service.PostService;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * PostLikeService 단위 테스트 (순수 Mockito — 실제 Redis/MySQL/SQS 인프라 불필요).
 *
 * 검증 포인트:
 *  1) toggleLike()는 Redis Lua 결과로 즉시 응답을 만든다.
 *  2) RDB 반영 경로가 SQS 발행 성공 여부에 따라 갈린다 —
 *     발행되면 Worker에 맡기고, 못 하면 그 자리에서 동기로 반영한다(폴백).
 *  3) 폴백이 실패해도 좋아요 응답은 성공한다. Redis에서 이미 확정된 결과라 뒤집으면 안 된다.
 *  4) getLikers()/getLikedPosts()는 존재 확인 후 size+1 조회 결과를 CursorResponse로 변환한다.
 *
 * RDB 반영 로직 자체(insert/delete + 카운트 증감)는 PostLikeRdbSyncerTest 담당이다.
 */
@ExtendWith(MockitoExtension.class)
class PostLikeServiceTest {

    private static final Long POST_ID = 1L;
    private static final Long USER_ID = 100L;

    @Mock
    private RedisTemplate<String, String> redisTemplate;
    @Mock
    private RedisScript<List> toggleLikeScript;
    @Mock
    private PostService postService;
    @Mock
    private UserService userService;
    @Mock
    private PostLikeEventPublisher eventPublisher;
    @Mock
    private PostLikeRdbSyncer rdbSyncer;
    @Mock
    private PostLikeMapper postLikeMapper;
    /**
     * 알림은 부가 기능이라 좋아요 동작 자체에는 영향이 없다(생성 실패도 그쪽에서 삼킨다).
     * 여기서는 "좋아요를 누를 때만 알림을 만든다"를 확인하는 데 쓴다.
     */
    @Mock
    private NotificationService notificationService;

    private PostLikeService postLikeService;

    @BeforeEach
    void setUp() {
        postLikeService = new PostLikeService(
                redisTemplate, toggleLikeScript, postService, userService,
                eventPublisher, rdbSyncer, postLikeMapper, notificationService);
    }

    /**
     * SQS가 켜져 있고 발행에 성공한 경우 — 정상 비동기 경로.
     * RDB 반영은 Worker 몫이라 toggleLike()는 RDB를 건드리지 않아야 한다.
     */
    @Nested
    class SqsOn {

        @Test
        void toggleLike_whenLiking_publishesEventAndSkipsSyncFallback() {
            givenPost();
            givenRedisToggle(1L, 5L);
            given(eventPublisher.publish(any())).willReturn(true);

            LikeToggleResponse response = postLikeService.toggleLike(POST_ID, USER_ID);

            assertThat(response.getIsLiked()).isTrue();
            assertThat(response.getLikeCount()).isEqualTo(5L);

            ArgumentCaptor<PostLikeEvent> captor = ArgumentCaptor.forClass(PostLikeEvent.class);
            verify(eventPublisher).publish(captor.capture());
            assertThat(captor.getValue()).isEqualTo(new PostLikeEvent(POST_ID, USER_ID, true));

            // 발행됐으니 동기 폴백은 타면 안 된다 (Worker가 처리)
            verifyNoInteractions(rdbSyncer);
            verifyNoInteractions(postLikeMapper);
        }

        @Test
        void toggleLike_whenUnliking_publishesUnlikeEvent() {
            givenPost();
            givenRedisToggle(0L, 3L);
            given(eventPublisher.publish(any())).willReturn(true);

            LikeToggleResponse response = postLikeService.toggleLike(POST_ID, USER_ID);

            assertThat(response.getIsLiked()).isFalse();
            assertThat(response.getLikeCount()).isEqualTo(3L);
            verify(eventPublisher).publish(new PostLikeEvent(POST_ID, USER_ID, false));
            verifyNoInteractions(rdbSyncer);
        }
    }

    /**
     * SQS가 꺼져 있거나 발행에 실패한 경우 — 동기 폴백 경로.
     * 이게 없으면 post_likes에 행이 안 쌓여 좋아요 목록 조회가 영원히 빈 배열이 된다.
     */
    @Nested
    class SqsOff {

        @Test
        void toggleLike_whenPublishReturnsFalse_syncsRdbImmediately() {
            givenPost();
            givenRedisToggle(1L, 1L);
            given(eventPublisher.publish(any())).willReturn(false);

            LikeToggleResponse response = postLikeService.toggleLike(POST_ID, USER_ID);

            assertThat(response.getIsLiked()).isTrue();
            assertThat(response.getLikeCount()).isEqualTo(1L);

            // 발행이 안 됐으니 그 자리에서 RDB에 반영해야 한다
            verify(rdbSyncer).sync(new PostLikeEvent(POST_ID, USER_ID, true));
        }

        @Test
        void toggleLike_whenUnlikingWithPublishFalse_syncsUnlikeToRdb() {
            givenPost();
            givenRedisToggle(0L, 0L);
            given(eventPublisher.publish(any())).willReturn(false);

            LikeToggleResponse response = postLikeService.toggleLike(POST_ID, USER_ID);

            assertThat(response.getIsLiked()).isFalse();
            verify(rdbSyncer).sync(new PostLikeEvent(POST_ID, USER_ID, false));
        }

        /**
         * 폴백이 터져도 좋아요는 성공이어야 한다.
         * Redis 정본은 이미 확정됐고 RDB는 백업본일 뿐이라, 여기서 예외가 나가면
         * 멀쩡히 성공한 좋아요가 500으로 뒤집힌다.
         */
        @Test
        void toggleLike_whenFallbackThrows_stillReturnsSuccessfulResponse() {
            givenPost();
            givenRedisToggle(1L, 7L);
            given(eventPublisher.publish(any())).willReturn(false);
            willThrow(new RuntimeException("DB 연결 실패")).given(rdbSyncer).sync(any());

            LikeToggleResponse response = postLikeService.toggleLike(POST_ID, USER_ID);

            assertThat(response.getIsLiked()).isTrue();
            assertThat(response.getLikeCount()).isEqualTo(7L);
        }

        @Test
        void toggleLike_whenFallbackThrows_doesNotPropagateException() {
            givenPost();
            givenRedisToggle(1L, 7L);
            given(eventPublisher.publish(any())).willReturn(false);
            willThrow(new RuntimeException("DB 연결 실패")).given(rdbSyncer).sync(any());

            assertThatCode(() -> postLikeService.toggleLike(POST_ID, USER_ID))
                    .doesNotThrowAnyException();
        }
    }

    @Test
    void toggleLike_whenPostNotFound_throwsAndSkipsRedisAndSqs() {
        given(postService.getPostOrThrow(POST_ID))
                .willThrow(new BusinessException(ErrorCode.POST_NOT_FOUND));

        assertThrows(BusinessException.class, () -> postLikeService.toggleLike(POST_ID, USER_ID));

        verifyNoInteractions(redisTemplate);
        verifyNoInteractions(eventPublisher);
        verifyNoInteractions(rdbSyncer);
    }

    // ---------- getLikers ----------

    @Test
    void getLikers_whenMoreResultsExist_returnsHasNextTrueWithNextCursor() {
        givenPost();
        // size=2 요청 -> size+1(3)개를 fetch. 마지막 3번째가 "다음 페이지 있음"의 증거로 잘려나가야 한다.
        given(postLikeMapper.selectLikersByPost(POST_ID, null, 3))
                .willReturn(List.of(likerOf(103L), likerOf(102L), likerOf(101L)));

        CursorResponse<PostLikerResponse> result = postLikeService.getLikers(POST_ID, null, 2);

        assertThat(result.getItems()).hasSize(2);
        assertThat(result.isHasNext()).isTrue();
        assertThat(result.getNextCursor()).isEqualTo(102L); // 잘리기 전 마지막(2번째) 항목의 likeId
    }

    @Test
    void getLikers_whenResultsFitInPage_returnsHasNextFalseWithNullCursor() {
        givenPost();
        given(postLikeMapper.selectLikersByPost(POST_ID, null, 3))
                .willReturn(List.of(likerOf(101L)));

        CursorResponse<PostLikerResponse> result = postLikeService.getLikers(POST_ID, null, 2);

        assertThat(result.getItems()).hasSize(1);
        assertThat(result.isHasNext()).isFalse();
        assertThat(result.getNextCursor()).isNull();
    }

    @Test
    void getLikers_whenPostNotFound_throws() {
        given(postService.getPostOrThrow(POST_ID))
                .willThrow(new BusinessException(ErrorCode.POST_NOT_FOUND));

        assertThrows(BusinessException.class, () -> postLikeService.getLikers(POST_ID, null, 2));

        verifyNoInteractions(postLikeMapper);
    }

    // ---------- getLikedPosts ----------

    @Test
    void getLikedPosts_whenUserExists_returnsLikedPosts() {
        given(userService.getUser(USER_ID)).willReturn(null); // 존재 확인만 하면 되므로 반환값 자체는 안 씀
        given(postLikeMapper.selectLikedPostsByUser(USER_ID, null, 3))
                .willReturn(List.of(likedPostOf(11L), likedPostOf(10L)));

        CursorResponse<LikedPostResponse> result = postLikeService.getLikedPosts(USER_ID, null, 2);

        assertThat(result.getItems()).hasSize(2);
        assertThat(result.isHasNext()).isFalse();
        assertThat(result.getNextCursor()).isNull();
    }

    @Test
    void getLikedPosts_whenUserNotFound_throwsAndSkipsMapper() {
        given(userService.getUser(USER_ID))
                .willThrow(new BusinessException(ErrorCode.USER_NOT_FOUND));

        assertThrows(BusinessException.class, () -> postLikeService.getLikedPosts(USER_ID, null, 2));

        verifyNoInteractions(postLikeMapper);
    }

    /**
     * 알림 연동 — 좋아요를 "누를 때만" 게시물 작성자에게 알림을 만든다.
     *
     * 취소에도 알림을 만들면 목록이 "좋아요를 눌렀다/취소했다"로 시끄러워진다.
     * 자기 글에 자기가 누른 경우를 걸러내는 책임은 알림 서비스에 있으므로 여기서는 확인하지 않는다.
     */
    @Nested
    class 알림연동 {

        private static final Long AUTHOR_ID = 777L;

        @Test
        void toggleLike_whenLiking_notifiesPostAuthor() {
            givenPostBy(AUTHOR_ID);
            givenRedisToggle(1L, 1L);
            given(eventPublisher.publish(any())).willReturn(true);

            postLikeService.toggleLike(POST_ID, USER_ID);

            verify(notificationService).notifyPostLike(AUTHOR_ID, USER_ID, POST_ID);
        }

        @Test
        void toggleLike_whenUnliking_doesNotNotify() {
            givenPostBy(AUTHOR_ID);
            givenRedisToggle(0L, 0L);   // 0 = 취소
            given(eventPublisher.publish(any())).willReturn(true);

            postLikeService.toggleLike(POST_ID, USER_ID);

            verifyNoInteractions(notificationService);
        }
    }

    // ---------- 테스트 데이터 헬퍼 ----------

    private void givenPost() {
        given(postService.getPostOrThrow(POST_ID)).willReturn(new Post());
    }

    /** 작성자가 있는 게시물. 알림 대상(recipient)이 작성자인지 확인할 때 쓴다 */
    private void givenPostBy(Long authorId) {
        given(postService.getPostOrThrow(POST_ID))
                .willReturn(Post.builder().userId(authorId).build());
    }

    private void givenRedisToggle(long liked, long count) {
        given(redisTemplate.execute(eq(toggleLikeScript), anyList(), any()))
                .willReturn(List.of(liked, count));
    }

    private PostLikerResponse likerOf(Long likeId) {
        PostLikerResponse response = new PostLikerResponse();
        response.setLikeId(likeId);
        response.setUserId(likeId); // 테스트용 임의값, 값 자체는 검증 대상이 아님
        response.setNickname("user-" + likeId);
        return response;
    }

    private LikedPostResponse likedPostOf(Long likeId) {
        LikedPostResponse response = new LikedPostResponse();
        response.setLikeId(likeId);
        response.setPostId(likeId);
        return response;
    }
}

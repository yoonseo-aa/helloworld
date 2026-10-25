package com.helloworld.domain.like.service;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.entity.CommentLike;
import com.helloworld.domain.like.mapper.CommentLikeMapper;
import com.helloworld.domain.like.messaging.CommentLikeEvent;
import com.helloworld.domain.like.messaging.CommentLikeEventPublisher;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * CommentLikeService 단위 테스트.
 * Redis/Mapper/Publisher를 목으로 대체해 DB·Redis 없이 순수 로직만 검증한다.
 *
 * 검증 관점
 *  - 없는(또는 삭제된) 댓글에 대한 에러 코드 + 부작용 차단
 *  - Lua 반환값 {liked, count} → is_liked/like_count 매핑
 *  - 토글 결과(liked)가 SQS 이벤트로 정확히 발행되는지
 *  - syncToRdb의 liked 분기(INSERT vs hard delete)
 */
@ExtendWith(MockitoExtension.class)
class CommentLikeServiceTest {

    private static final Long COMMENT_ID = 100L;
    private static final Long USER_ID = 7L;

    @Mock
    private RedisTemplate<String, String> redisTemplate;
    @Mock
    private RedisScript<List> toggleLikeScript;
    @Mock
    private CommentLikeMapper commentLikeMapper;
    @Mock
    private CommentLikeEventPublisher eventPublisher;

    @InjectMocks
    private CommentLikeService commentLikeService;

    @Nested
    @DisplayName("좋아요 토글")
    class ToggleLike {

        @Test
        @DisplayName("없는(또는 삭제된) 댓글이면 COMMENT_NOT_FOUND 를 던지고 Redis·이벤트 발행을 하지 않는다")
        void commentNotFound() {
            given_existsActiveComment(false);

            assertThatThrownBy(() -> commentLikeService.toggleLike(COMMENT_ID, USER_ID))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);

            verifyNoInteractions(redisTemplate, eventPublisher);
        }

        @Test
        @DisplayName("신규 좋아요면 is_liked=true·like_count 를 반환하고 liked=true 이벤트를 발행한다")
        void like() {
            given_existsActiveComment(true);
            given_luaReturns(1L, 3L); // {liked=1, count=3}

            LikeToggleResponse response = commentLikeService.toggleLike(COMMENT_ID, USER_ID);

            assertThat(response.getIsLiked()).isTrue();
            assertThat(response.getLikeCount()).isEqualTo(3L);

            CommentLikeEvent published = capturePublishedEvent();
            assertThat(published.isLiked()).isTrue();
            assertThat(published.getCommentId()).isEqualTo(COMMENT_ID);
            assertThat(published.getActorUserId()).isEqualTo(USER_ID);
        }

        @Test
        @DisplayName("이미 좋아요 상태면 is_liked=false 로 토글되고 liked=false 이벤트를 발행한다")
        void unlike() {
            given_existsActiveComment(true);
            given_luaReturns(0L, 0L); // {liked=0, count=0}

            LikeToggleResponse response = commentLikeService.toggleLike(COMMENT_ID, USER_ID);

            assertThat(response.getIsLiked()).isFalse();
            assertThat(response.getLikeCount()).isEqualTo(0L);

            assertThat(capturePublishedEvent().isLiked()).isFalse();
        }
    }

    @Nested
    @DisplayName("RDB 비동기 반영(syncToRdb)")
    class SyncToRdb {

        @Test
        @DisplayName("liked=true 면 comment_likes 에 INSERT 한다 (관계 행만 — 카운트 컬럼은 건드리지 않는다)")
        void insertOnLike() {
            commentLikeService.syncToRdb(new CommentLikeEvent(COMMENT_ID, USER_ID, true));

            verify(commentLikeMapper).insertLikeIfAbsent(any(CommentLike.class));
            verify(commentLikeMapper, never()).deleteLike(any(), any());
        }

        @Test
        @DisplayName("liked=false 면 comment_likes 에서 hard delete 한다")
        void deleteOnUnlike() {
            commentLikeService.syncToRdb(new CommentLikeEvent(COMMENT_ID, USER_ID, false));

            verify(commentLikeMapper).deleteLike(COMMENT_ID, USER_ID);
            verify(commentLikeMapper, never()).insertLikeIfAbsent(any());
        }

        @Test
        @DisplayName("중복 이벤트(0건 반영)여도 아무 일도 더 일어나지 않는다 — at-least-once 멱등")
        void duplicateEventIsIdempotent() {
            // 카운트 컬럼을 갱신하지 않으므로 "행이 바뀌었는지"에 따라 갈리는 동작 자체가 없다.
            // INSERT IGNORE / hard delete 가 그대로 멱등하다.
            given(commentLikeMapper.insertLikeIfAbsent(any(CommentLike.class))).willReturn(0);
            given(commentLikeMapper.deleteLike(COMMENT_ID, USER_ID)).willReturn(0);

            commentLikeService.syncToRdb(new CommentLikeEvent(COMMENT_ID, USER_ID, true));
            commentLikeService.syncToRdb(new CommentLikeEvent(COMMENT_ID, USER_ID, false));

            verify(commentLikeMapper).insertLikeIfAbsent(any(CommentLike.class));
            verify(commentLikeMapper).deleteLike(COMMENT_ID, USER_ID);
        }
    }

    // ===================== helpers =====================

    private void given_existsActiveComment(boolean exists) {
        given(commentLikeMapper.existsActiveComment(COMMENT_ID)).willReturn(exists);
    }

    private void given_luaReturns(long liked, long count) {
        doReturn(List.of(liked, count)).when(redisTemplate)
                .execute(any(RedisScript.class), anyList(), any());
    }

    private CommentLikeEvent capturePublishedEvent() {
        ArgumentCaptor<CommentLikeEvent> captor = ArgumentCaptor.forClass(CommentLikeEvent.class);
        verify(eventPublisher).publish(captor.capture());
        return captor.getValue();
    }
}

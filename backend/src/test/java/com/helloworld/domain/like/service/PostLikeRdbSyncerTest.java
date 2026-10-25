package com.helloworld.domain.like.service;

import com.helloworld.domain.like.mapper.PostLikeMapper;
import com.helloworld.domain.like.messaging.PostLikeEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Redis 정본을 RDB에 반영하는 로직 검증.
 *
 * 이 컴포넌트는 두 경로에서 호출된다 — SQS Worker(비동기)와 toggleLike()의 동기 폴백.
 * 두 경로가 같은 코드를 쓰므로, 반영 규칙은 여기서 한 번만 검증하면 된다.
 *
 * 핵심 검증은 "관계 행만 바꾸고 posts 테이블은 건드리지 않는다"다.
 * 부모 행을 UPDATE하면 post_likes의 FK 검사가 잡는 S 락과 맞물려 데드락이 나고,
 * 그 예외가 삼켜져 조용히 RDB만 어긋난다(실측 10건 중 8건 유실).
 * 자세한 배경은 PostLikeRdbSyncer 자바독 참고.
 */
@ExtendWith(MockitoExtension.class)
class PostLikeRdbSyncerTest {

    private static final Long POST_ID = 1L;
    private static final Long USER_ID = 100L;

    @Mock
    private PostLikeMapper postLikeMapper;

    @InjectMocks
    private PostLikeRdbSyncer rdbSyncer;

    @Test
    void sync_whenLiked_insertsRowOnly() {
        rdbSyncer.sync(new PostLikeEvent(POST_ID, USER_ID, true));

        verify(postLikeMapper).insertLikeIfAbsent(argThat(like ->
                like.getPostId().equals(POST_ID) && like.getUserId().equals(USER_ID)));
        verify(postLikeMapper, never()).deleteLike(any(), any());
    }

    @Test
    void sync_whenUnliked_deletesRowOnly() {
        rdbSyncer.sync(new PostLikeEvent(POST_ID, USER_ID, false));

        verify(postLikeMapper).deleteLike(POST_ID, USER_ID);
        verify(postLikeMapper, never()).insertLikeIfAbsent(any());
    }

    /**
     * SQS는 최소 한 번(at-least-once) 전달이라 같은 이벤트가 두 번 올 수 있다.
     * 그때 호출되는 것이 멱등한 쿼리(INSERT IGNORE / 조건 DELETE)뿐이어야 한다 —
     * 카운트 증감처럼 누적되는 연산이 끼면 두 번째 전달에서 값이 어긋난다.
     */
    @Test
    void sync_isIdempotent_whenSameEventArrivesTwice() {
        PostLikeEvent event = new PostLikeEvent(POST_ID, USER_ID, true);

        rdbSyncer.sync(event);
        rdbSyncer.sync(event);

        // INSERT IGNORE라 두 번 실행돼도 행은 하나가 된다(누적 연산이 없다).
        verify(postLikeMapper, times(2)).insertLikeIfAbsent(any());
        verify(postLikeMapper, never()).deleteLike(any(), any());
    }
}

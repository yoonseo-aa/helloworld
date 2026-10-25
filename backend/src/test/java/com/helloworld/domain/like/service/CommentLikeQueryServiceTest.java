package com.helloworld.domain.like.service;

import com.helloworld.domain.like.service.CommentLikeQueryService.CommentLikeStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * CommentLikeQueryService 단위 테스트.
 * Redis(RedisTemplate)는 목으로 대체하고, Lua 배치 결과의 매핑 로직만 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class CommentLikeQueryServiceTest {

    @Mock
    private RedisTemplate<String, String> redisTemplate;

    @InjectMocks
    private CommentLikeQueryService service;

    @Test
    @DisplayName("평면 배열 [liked,count,...]을 commentId 순서대로 상태로 매핑한다")
    void mapsBatchResult() {
        // 100번: liked=1, count=5 / 200번: liked=0, count=3
        given(redisTemplate.execute(any(RedisScript.class), anyList(), any()))
                .willReturn(List.of(1L, 5L, 0L, 3L));

        Map<Long, CommentLikeStatus> result = service.getLikeStatuses(List.of(100L, 200L), 1L);

        assertThat(result).hasSize(2);
        assertThat(result.get(100L)).isEqualTo(new CommentLikeStatus(true, 5L));
        assertThat(result.get(200L)).isEqualTo(new CommentLikeStatus(false, 3L));
    }

    @Test
    @DisplayName("빈 목록이면 Redis를 호출하지 않고 빈 맵을 반환한다")
    void emptyListSkipsRedis() {
        Map<Long, CommentLikeStatus> result = service.getLikeStatuses(List.of(), 1L);

        assertThat(result).isEmpty();
        verify(redisTemplate, never()).execute(any(RedisScript.class), anyList(), any());
    }

    @Test
    @DisplayName("스크립트 결과가 null이면 방어적으로 빈 맵을 반환한다")
    void nullResultReturnsEmpty() {
        given(redisTemplate.execute(any(RedisScript.class), anyList(), any()))
                .willReturn(null);

        Map<Long, CommentLikeStatus> result = service.getLikeStatuses(List.of(100L), 1L);

        assertThat(result).isEmpty();
    }
}

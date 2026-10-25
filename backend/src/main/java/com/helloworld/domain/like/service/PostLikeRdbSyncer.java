package com.helloworld.domain.like.service;

import com.helloworld.domain.like.entity.PostLike;
import com.helloworld.domain.like.mapper.PostLikeMapper;
import com.helloworld.domain.like.messaging.PostLikeEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Redis 정본을 RDB({@code post_likes})에 반영한다. <b>관계 행만</b> 다룬다.
 *
 * <p>[왜 PostLikeService에서 분리했나]
 * 이 로직은 두 경로에서 호출된다.
 * <ol>
 *   <li>SQS Worker(PostLikeEventListener)가 큐에서 이벤트를 꺼내 비동기로 — 정상 경로</li>
 *   <li>PostLikeService.toggleLike()가 SQS 발행에 실패했을 때 동기 폴백으로</li>
 * </ol>
 * 2번 때문에 별도 빈이어야 한다. 같은 클래스 안에서 자기 {@code @Transactional} 메서드를
 * 호출하면 스프링 AOP 프록시를 거치지 않아 트랜잭션이 아예 걸리지 않는다(자기 호출 문제).
 *
 * <p><b>[카운트를 여기서 갱신하지 않는 이유 — 팔로우와 같은 구조]</b>
 * 예전에는 {@code posts.like_count}를 +1/-1로 함께 갱신했는데 문제가 두 개 있었다.
 * <ul>
 *   <li><b>데드락</b>: {@code post_likes}의 INSERT/DELETE는 FK 검사로 부모 {@code posts} 행에
 *       S(공유) 락을 잡는다. 이어서 그 행을 UPDATE하려면 X(배타) 락이 필요한데, 같은 게시물에
 *       두 요청이 겹치면 서로 S를 든 채 X를 기다려 MySQL이 한쪽을 죽인다. 그 예외는
 *       {@code syncFallback}이 삼키므로 <b>조용히 RDB만 어긋났다</b>
 *       (10명 동시 좋아요 실측에서 8건 유실).</li>
 *   <li><b>멱등하지 않음</b>: SQS는 최소 한 번(at-least-once) 전달이라 같은 이벤트가 두 번 오면
 *       카운트가 2 오른다.</li>
 * </ul>
 * 팔로우({@code FollowService.applyFollowEvent})는 애초에 카운트 컬럼을 유지하지 않는다 —
 * 관계 행만 남기고 카운트는 <b>정본인 Redis에서 센다</b>. 그래서 두 문제 모두 없다.
 * 좋아요도 같은 구조로 맞췄다: 부모 테이블을 건드리지 않으니 데드락이 사라지고,
 * {@code INSERT IGNORE}/조건 DELETE는 그 자체로 멱등해 중복 이벤트도 안전하다.
 *
 * <p>{@code posts.like_count} 컬럼은 이제 이 경로에서 갱신하지 않는다. 목록 조회는 실제
 * {@code post_likes} 행 수로 계산하고, 피드·상세의 카운트는 Redis에서 읽는다.
 */
@Component
@RequiredArgsConstructor
public class PostLikeRdbSyncer {

    private final PostLikeMapper postLikeMapper;

    @Transactional
    public void sync(PostLikeEvent event) {
        // 관계 행만 바꾼다. posts 테이블은 건드리지 않는다 — 팔로우(applyFollowEvent)와 같은 형태다.
        if (event.liked()) {
            postLikeMapper.insertLikeIfAbsent(
                    PostLike.builder().postId(event.postId()).userId(event.actorUserId()).build());
        } else {
            postLikeMapper.deleteLike(event.postId(), event.actorUserId());
        }
    }
}

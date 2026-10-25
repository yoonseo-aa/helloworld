package com.helloworld.domain.comment.service;

import com.helloworld.domain.comment.dto.request.CommentCreateRequest;
import com.helloworld.domain.comment.dto.request.CommentUpdateRequest;
import com.helloworld.domain.comment.dto.response.CommentCreateResponse;
import com.helloworld.domain.comment.dto.response.CommentResponse;
import com.helloworld.domain.comment.entity.Comment;
import com.helloworld.domain.comment.mapper.CommentMapper;
import com.helloworld.domain.like.service.CommentLikeQueryService;
import com.helloworld.domain.like.service.CommentLikeQueryService.CommentLikeStatus;
import com.helloworld.domain.notification.service.NotificationService;
import com.helloworld.global.common.PageResponse;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 댓글 비즈니스 로직 (서비스 계층).
 *
 * [학습 포인트] 왜 생성·삭제에 @Transactional이 필요한가?
 *  - 댓글 INSERT와 posts.comment_count UPDATE는 "둘 다 성공하거나 둘 다 실패"해야 한다.
 *    하나만 반영되면 화면의 댓글 수와 실제 댓글이 어긋난다.
 *  - 조회 메서드에는 readOnly = true를 붙인다. 쓰기 락을 잡지 않아 가볍고,
 *    "이 메서드는 데이터를 바꾸지 않는다"는 의도가 코드로 드러난다.
 *
 * [학습 포인트] 권한 검증을 Service에 두는 이유
 *  - "내 댓글만 수정·삭제 가능"은 HTTP가 아니라 도메인 규칙이다.
 *  - Controller가 아니라 여기 있어야 다른 진입점(배치, 다른 API)에서 호출해도 같은 규칙이 적용된다.
 */
@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentMapper commentMapper;
    private final CommentLikeQueryService commentLikeQueryService; // 목록 좋아요 표시(Redis 읽기 전용, 순환참조 회피)
    private final NotificationService notificationService;          // 댓글 알림(실패를 삼키고 커밋 후에 보낸다)

    /**
     * 댓글 생성.
     *
     * @param userId  작성자 id (인증 토큰에서 추출)
     * @param postId  대상 게시물 id (URL 경로)
     * @param request 본문
     */
    @Transactional
    public CommentCreateResponse createComment(Long userId, Long postId, CommentCreateRequest request) {
        // 없는 게시물에 댓글이 달리면 FK 오류(500)가 난다 → 그 전에 404로 명확히 알려준다.
        // 작성자 id는 댓글 알림을 받을 사람이다. 존재 확인을 겸하므로 조회가 늘지 않는다.
        Long postAuthorId = commentMapper.selectPostAuthorId(postId);
        if (postAuthorId == null) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }

        // ⚠️ 순서 주의 — 카운트 UPDATE가 INSERT보다 먼저다. 뒤집으면 동시 댓글이 유실된다.
        //
        // comments INSERT는 FK 검사로 posts 행에 공유(S) 락을 잡는다. 그 뒤 같은 트랜잭션이
        // comment_count UPDATE로 같은 행의 배타(X) 락을 요구하면, 동시 요청끼리 서로 S를 든 채
        // X를 기다려 데드락이 난다. 8명이 같은 게시물에 동시에 댓글을 달았을 때 7건이 500으로
        // 실패하고 1건만 저장됐다(좋아요에서 같은 형태를 겪었다).
        // 가장 강한 락을 먼저 잡으면(X 선점) 뒤 요청은 대기만 하고 전부 성공한다.
        //
        // 목록 화면이 매번 COUNT(*)를 돌리지 않도록 게시물에 캐시된 카운트를 갱신한다.
        commentMapper.addPostCommentCount(postId, 1);

        Comment comment = Comment.builder()
                .postId(postId)
                .userId(userId)
                .content(request.getContent())
                .build();
        commentMapper.insertComment(comment);

        // 게시물 작성자에게 알림. 알림 쪽이 자기 알림(내 글에 내 댓글)을 걸러내고,
        // 실패를 삼키며, 이 트랜잭션이 커밋된 뒤에 실행되도록 스스로 미룬다.
        // → 알림 때문에 댓글 작성이 실패하거나 느려지지 않는다. (NotificationService 주석 참고)
        notificationService.notifyPostComment(postAuthorId, userId, postId, comment.getCommentId());

        return CommentCreateResponse.of(comment.getCommentId());
    }

    /**
     * 댓글 수정. 본인이 쓴, 삭제되지 않은 댓글만 수정할 수 있다.
     */
    @Transactional
    public void updateComment(Long userId, Long commentId, CommentUpdateRequest request) {
        Comment comment = getActiveCommentOrThrow(commentId);
        validateOwner(comment, userId);

        commentMapper.updateCommentContent(commentId, request.getContent());
    }

    /**
     * 댓글 삭제 (soft delete). 본인이 쓴, 아직 살아 있는 댓글만 삭제할 수 있다.
     */
    @Transactional
    public void deleteComment(Long userId, Long commentId) {
        Comment comment = getActiveCommentOrThrow(commentId);
        validateOwner(comment, userId);

        // ⚠️ 실제로 지워진 경우에만 카운트를 줄인다.
        // 같은 댓글에 삭제 요청이 동시에 두 번 오면 둘 다 위 검사(살아 있음)를 통과한다.
        // UPDATE의 is_deleted = FALSE 조건 덕에 실제 삭제는 한 번뿐인데, 카운트를 무조건 줄이면
        // 2가 빠져 화면의 댓글 수가 실제보다 적어진다. (GREATEST(...,0)은 음수만 막는다)
        if (commentMapper.softDeleteComment(commentId) > 0) {
            commentMapper.addPostCommentCount(comment.getPostId(), -1);
        }
    }

    /**
     * 게시물의 댓글 목록 (오프셋 페이징, 오래된 순).
     *
     * @param loginUserId 로그인 사용자 id — 각 댓글의 is_mine 계산에만 쓴다
     */
    @Transactional(readOnly = true)
    public PageResponse<CommentResponse> getComments(Long loginUserId, Long postId, int page, int size) {
        if (!commentMapper.existsPost(postId)) {
            throw new BusinessException(ErrorCode.POST_NOT_FOUND);
        }

        int offset = page * size;
        List<CommentResponse> items = commentMapper.selectCommentsByPostId(postId, offset, size);
        long totalCount = commentMapper.countCommentsByPostId(postId);

        // 좋아요 정보(is_liked/like_count)는 Redis 정본에서 한 번에 배치로 읽는다(SQS 상태와 무관하게 정확).
        List<Long> commentIds = items.stream().map(CommentResponse::getCommentId).toList();
        Map<Long, CommentLikeStatus> likeStatuses =
                commentLikeQueryService.getLikeStatuses(commentIds, loginUserId);

        // DB에서 오지 않는 파생 값이라 조회 후에 채운다.
        for (CommentResponse item : items) {
            boolean mine = item.getAuthor() != null
                    && Objects.equals(item.getAuthor().getUserId(), loginUserId);
            item.setIsMine(mine);

            CommentLikeStatus status = likeStatuses.get(item.getCommentId());
            item.setLikeCount(status != null ? status.likeCount() : 0L);
            item.setIsLiked(status != null && status.liked());
        }

        return PageResponse.of(items, page, size, totalCount);
    }

    // comments.like_count 를 갱신하던 increaseLikeCount / decreaseLikeCount 는 제거했다.
    // 이유는 CommentLikeService.syncToRdb 주석에 적었다 — 그 컬럼을 읽는 쿼리가 하나도 없고
    // (좋아요 수는 Redis 정본에서 온다), 갱신하면 comment_likes INSERT의 FK 공유 락과 물려
    // 데드락이 난다. 게시물 좋아요에서 같은 이유로 이미 제거한 패턴이다.

    /* ===================== 내부 헬퍼 ===================== */

    /**
     * 살아 있는 댓글을 가져오거나 404를 던진다.
     *
     * [학습 포인트] 삭제된 댓글도 404로 응답하는 이유
     *  - 이미 지운 리소스를 "있지만 접근 불가(403)"로 알려주면 존재 여부가 노출된다.
     *  - 클라이언트 입장에서도 "없는 것"과 동일하게 다루는 편이 단순하다.
     */
    private Comment getActiveCommentOrThrow(Long commentId) {
        Comment comment = commentMapper.selectCommentById(commentId);
        if (comment == null || Boolean.TRUE.equals(comment.getIsDeleted())) {
            throw new BusinessException(ErrorCode.COMMENT_NOT_FOUND);
        }
        return comment;
    }

    /** 작성자 본인이 아니면 403 */
    private void validateOwner(Comment comment, Long userId) {
        if (!Objects.equals(comment.getUserId(), userId)) {
            throw new BusinessException(ErrorCode.COMMENT_FORBIDDEN);
        }
    }
}

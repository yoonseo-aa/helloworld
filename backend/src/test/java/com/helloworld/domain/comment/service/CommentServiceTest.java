package com.helloworld.domain.comment.service;

import com.helloworld.domain.comment.dto.request.CommentCreateRequest;
import com.helloworld.domain.comment.dto.request.CommentUpdateRequest;
import com.helloworld.domain.comment.dto.response.CommentAuthorResponse;
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
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * CommentService 단위 테스트.
 * Mapper는 목(mock)으로 대체하므로 DB 없이 순수 로직만 검증한다.
 *
 * 검증 관점
 *  - 권한 규칙(본인 댓글만 수정·삭제)
 *  - 없는 리소스에 대한 에러 코드
 *  - posts.comment_count 증감이 함께 일어나는지
 *  - is_mine 파생 값 계산
 */
@ExtendWith(MockitoExtension.class)
class CommentServiceTest {

    private static final Long AUTHOR_ID = 1L;
    private static final Long STRANGER_ID = 2L;
    private static final Long POST_ID = 10L;
    private static final Long COMMENT_ID = 100L;
    /** 게시물 작성자 = 댓글 알림을 받는 사람 */
    private static final Long POST_AUTHOR_ID = 7L;

    @Mock
    private CommentMapper commentMapper;

    @Mock
    private CommentLikeQueryService commentLikeQueryService;

    @Mock
    private NotificationService notificationService;

    @InjectMocks
    private CommentService commentService;

    /* ===================== 생성 ===================== */

    @Nested
    @DisplayName("댓글 생성")
    class CreateComment {

        @Test
        @DisplayName("성공하면 댓글이 저장되고 게시물의 댓글 수가 1 증가한다")
        void success() {
            CommentCreateRequest request = requestOf("첫 댓글");
            given(commentMapper.selectPostAuthorId(POST_ID)).willReturn(POST_AUTHOR_ID);
            // insert 시 DB가 채워주는 PK를 흉내 낸다
            doAnswer(invocation -> {
                Comment saved = invocation.getArgument(0);
                saved.setCommentId(COMMENT_ID);
                return 1;
            }).when(commentMapper).insertComment(any(Comment.class));

            CommentCreateResponse response = commentService.createComment(AUTHOR_ID, POST_ID, request);

            assertThat(response.getCommentId()).isEqualTo(COMMENT_ID);
            verify(commentMapper).addPostCommentCount(POST_ID, 1);
        }

        @Test
        @DisplayName("없는 게시물이면 POST_NOT_FOUND 를 던지고 댓글을 저장하지 않는다")
        void postNotFound() {
            // 작성자 조회가 null = 게시물 없음 (존재 확인을 겸한다)
            given(commentMapper.selectPostAuthorId(POST_ID)).willReturn(null);

            assertThatThrownBy(() -> commentService.createComment(AUTHOR_ID, POST_ID, requestOf("내용")))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.POST_NOT_FOUND);

            verify(commentMapper, never()).insertComment(any());
            verify(commentMapper, never()).addPostCommentCount(anyLong(), anyInt());
            verify(notificationService, never()).notifyPostComment(any(), any(), any(), any());
        }

        @Test
        @DisplayName("게시물 작성자에게 댓글 알림을 보낸다 (자기 글 여부 판단은 알림 쪽이 한다)")
        void notifiesPostAuthor() {
            given(commentMapper.selectPostAuthorId(POST_ID)).willReturn(POST_AUTHOR_ID);
            doAnswer(invocation -> {
                Comment saved = invocation.getArgument(0);
                saved.setCommentId(COMMENT_ID);
                return 1;
            }).when(commentMapper).insertComment(any(Comment.class));

            commentService.createComment(STRANGER_ID, POST_ID, requestOf("좋은 글이네요"));

            verify(notificationService).notifyPostComment(POST_AUTHOR_ID, STRANGER_ID, POST_ID, COMMENT_ID);
        }
        // "알림이 실패해도 댓글이 살아남는가"는 여기서 검증하지 않는다.
        // 방어는 NotificationService 안에 있고(예외 삼킴 + 커밋 후 실행),
        // NotificationServiceTest가 그 약속을 지킨다. 여기서 또 감싸면 방어가 두 곳으로 흩어진다.
    }

    /* ===================== 수정 ===================== */

    @Nested
    @DisplayName("댓글 수정")
    class UpdateComment {

        @Test
        @DisplayName("작성자 본인이면 본문이 수정된다")
        void success() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, false));

            commentService.updateComment(AUTHOR_ID, COMMENT_ID, updateRequestOf("수정된 내용"));

            verify(commentMapper).updateCommentContent(COMMENT_ID, "수정된 내용");
        }

        @Test
        @DisplayName("다른 사람의 댓글이면 COMMENT_FORBIDDEN 을 던진다")
        void forbidden() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, false));

            assertThatThrownBy(() -> commentService.updateComment(STRANGER_ID, COMMENT_ID, updateRequestOf("탈취")))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMENT_FORBIDDEN);

            verify(commentMapper, never()).updateCommentContent(anyLong(), any());
        }

        @Test
        @DisplayName("존재하지 않는 댓글이면 COMMENT_NOT_FOUND 를 던진다")
        void notFound() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(null);

            assertThatThrownBy(() -> commentService.updateComment(AUTHOR_ID, COMMENT_ID, updateRequestOf("내용")))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);
        }

        @Test
        @DisplayName("이미 삭제된 댓글이면 COMMENT_NOT_FOUND 를 던진다")
        void alreadyDeleted() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, true));

            assertThatThrownBy(() -> commentService.updateComment(AUTHOR_ID, COMMENT_ID, updateRequestOf("내용")))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMENT_NOT_FOUND);
        }
    }

    /* ===================== 삭제 ===================== */

    @Nested
    @DisplayName("댓글 삭제")
    class DeleteComment {

        @Test
        @DisplayName("작성자 본인이면 soft delete 되고 게시물의 댓글 수가 1 감소한다")
        void success() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, false));
            given(commentMapper.softDeleteComment(COMMENT_ID)).willReturn(1);

            commentService.deleteComment(AUTHOR_ID, COMMENT_ID);

            verify(commentMapper).softDeleteComment(COMMENT_ID);
            verify(commentMapper).addPostCommentCount(POST_ID, -1);
        }

        @Test
        @DisplayName("이미 지워진 뒤였다면(0행) 카운트를 줄이지 않는다 — 동시 삭제로 2가 빠지면 안 된다")
        void concurrentDeleteDoesNotDoubleDecrement() {
            // 같은 댓글에 삭제 요청이 동시에 두 번 오면 둘 다 "살아 있음" 검사를 통과한다.
            // 실제 삭제는 UPDATE의 is_deleted = FALSE 조건 때문에 한 번뿐이다.
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, false));
            given(commentMapper.softDeleteComment(COMMENT_ID)).willReturn(0);

            commentService.deleteComment(AUTHOR_ID, COMMENT_ID);

            verify(commentMapper, never()).addPostCommentCount(anyLong(), anyInt());
        }

        @Test
        @DisplayName("다른 사람의 댓글이면 COMMENT_FORBIDDEN 을 던지고 카운트도 건드리지 않는다")
        void forbidden() {
            given(commentMapper.selectCommentById(COMMENT_ID)).willReturn(comment(AUTHOR_ID, false));

            assertThatThrownBy(() -> commentService.deleteComment(STRANGER_ID, COMMENT_ID))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.COMMENT_FORBIDDEN);

            verify(commentMapper, never()).softDeleteComment(anyLong());
            verify(commentMapper, never()).addPostCommentCount(anyLong(), anyInt());
        }
    }

    /* ===================== 목록 ===================== */

    @Nested
    @DisplayName("댓글 목록 조회")
    class GetComments {

        @Test
        @DisplayName("내가 쓴 댓글에만 is_mine 이 true 로 채워진다")
        void marksMine() {
            given(commentMapper.existsPost(POST_ID)).willReturn(true);
            given(commentMapper.selectCommentsByPostId(POST_ID, 0, 20))
                    .willReturn(List.of(responseOf(AUTHOR_ID), responseOf(STRANGER_ID)));
            given(commentMapper.countCommentsByPostId(POST_ID)).willReturn(2L);

            PageResponse<CommentResponse> page = commentService.getComments(AUTHOR_ID, POST_ID, 0, 20);

            assertThat(page.getTotalCount()).isEqualTo(2L);
            assertThat(page.getItems()).extracting(CommentResponse::getIsMine)
                    .containsExactly(true, false);
        }

        @Test
        @DisplayName("page 가 1 이면 offset 은 size 만큼 밀린다")
        void offsetIsCalculated() {
            given(commentMapper.existsPost(POST_ID)).willReturn(true);
            given(commentMapper.selectCommentsByPostId(POST_ID, 20, 20)).willReturn(List.of());
            given(commentMapper.countCommentsByPostId(POST_ID)).willReturn(0L);

            commentService.getComments(AUTHOR_ID, POST_ID, 1, 20);

            verify(commentMapper).selectCommentsByPostId(POST_ID, 20, 20);
        }

        @Test
        @DisplayName("없는 게시물이면 POST_NOT_FOUND 를 던진다")
        void postNotFound() {
            given(commentMapper.existsPost(POST_ID)).willReturn(false);

            assertThatThrownBy(() -> commentService.getComments(AUTHOR_ID, POST_ID, 0, 20))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.POST_NOT_FOUND);
        }

        @Test
        @DisplayName("좋아요 정보(is_liked/like_count)가 Redis 조회 결과로 채워진다")
        void fillsLikeStatus() {
            given(commentMapper.existsPost(POST_ID)).willReturn(true);
            given(commentMapper.selectCommentsByPostId(POST_ID, 0, 20))
                    .willReturn(List.of(responseOf(AUTHOR_ID)));
            given(commentMapper.countCommentsByPostId(POST_ID)).willReturn(1L);
            given(commentLikeQueryService.getLikeStatuses(List.of(COMMENT_ID), AUTHOR_ID))
                    .willReturn(Map.of(COMMENT_ID, new CommentLikeStatus(true, 7L)));

            PageResponse<CommentResponse> page = commentService.getComments(AUTHOR_ID, POST_ID, 0, 20);

            CommentResponse item = page.getItems().get(0);
            assertThat(item.getIsLiked()).isTrue();
            assertThat(item.getLikeCount()).isEqualTo(7L);
        }

        @Test
        @DisplayName("Redis에 좋아요 정보가 없는 댓글은 like_count=0, is_liked=false 로 채워진다")
        void defaultsLikeStatusWhenAbsent() {
            given(commentMapper.existsPost(POST_ID)).willReturn(true);
            given(commentMapper.selectCommentsByPostId(POST_ID, 0, 20))
                    .willReturn(List.of(responseOf(AUTHOR_ID)));
            given(commentMapper.countCommentsByPostId(POST_ID)).willReturn(1L);
            given(commentLikeQueryService.getLikeStatuses(List.of(COMMENT_ID), AUTHOR_ID))
                    .willReturn(Map.of()); // 조회 결과에 없음

            PageResponse<CommentResponse> page = commentService.getComments(AUTHOR_ID, POST_ID, 0, 20);

            CommentResponse item = page.getItems().get(0);
            assertThat(item.getIsLiked()).isFalse();
            assertThat(item.getLikeCount()).isEqualTo(0L);
        }
    }

    /* ===================== 픽스처 ===================== */

    private CommentCreateRequest requestOf(String content) {
        CommentCreateRequest request = new CommentCreateRequest();
        ReflectionTestUtils.setField(request, "content", content);
        return request;
    }

    private CommentUpdateRequest updateRequestOf(String content) {
        CommentUpdateRequest request = new CommentUpdateRequest();
        ReflectionTestUtils.setField(request, "content", content);
        return request;
    }

    private Comment comment(Long ownerId, boolean deleted) {
        Comment comment = new Comment();
        comment.setCommentId(COMMENT_ID);
        comment.setPostId(POST_ID);
        comment.setUserId(ownerId);
        comment.setContent("원본 내용");
        comment.setIsDeleted(deleted);
        return comment;
    }

    private CommentResponse responseOf(Long authorId) {
        CommentAuthorResponse author = new CommentAuthorResponse();
        author.setUserId(authorId);
        author.setNickname("작성자" + authorId);

        CommentResponse response = new CommentResponse();
        response.setCommentId(COMMENT_ID);
        response.setContent("내용");
        response.setAuthor(author);
        return response;
    }
}

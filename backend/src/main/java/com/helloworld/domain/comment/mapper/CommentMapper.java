package com.helloworld.domain.comment.mapper;

import com.helloworld.domain.comment.dto.response.CommentResponse;
import com.helloworld.domain.comment.entity.Comment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 댓글 DB 접근 (MyBatis). SQL은 resources/mapper/comment/CommentMapper.xml 에 작성.
 * namespace가 이 인터페이스 FQCN과 일치해야 한다.
 *
 * [학습 포인트] 조회용 메서드가 엔티티(Comment)와 DTO(CommentResponse)로 나뉘는 이유
 *  - selectCommentById: 권한 검증에 필요한 원본 행(작성자·삭제여부)을 그대로 가져온다.
 *  - selectCommentsByPostId: 화면에 내려줄 형태(작성자 닉네임 조인)로 바로 받는다.
 *    목록마다 작성자를 N번 더 조회하는 N+1 문제를 JOIN 한 번으로 피한다.
 */
@Mapper
public interface CommentMapper {

    /** 게시물 존재 여부 (삭제 기능이 없으므로 행 존재만 확인) */
    boolean existsPost(@Param("postId") Long postId);

    /**
     * 게시물 작성자 id. 게시물이 없으면 null — <b>존재 확인을 겸한다.</b>
     *
     * <p>댓글 알림을 받을 사람이 게시물 작성자다. 존재 확인({@link #existsPost})과 따로 조회하면
     * 같은 행을 두 번 읽게 되므로, 알림이 필요한 생성 경로에서는 이 메서드 하나로 처리한다.
     */
    Long selectPostAuthorId(@Param("postId") Long postId);

    /** 댓글 등록. 성공 시 comment.commentId 채워짐 */
    int insertComment(Comment comment);

    /** 댓글 단건 조회 (삭제된 것도 포함해서 가져온다 — 삭제 여부 판단은 Service가 한다) */
    Comment selectCommentById(@Param("commentId") Long commentId);

    /** 본문 수정. updated_at은 테이블의 ON UPDATE CURRENT_TIMESTAMP가 갱신 */
    int updateCommentContent(@Param("commentId") Long commentId, @Param("content") String content);

    /** Soft delete (is_deleted = TRUE) */
    int softDeleteComment(@Param("commentId") Long commentId);

    /** 게시물의 댓글 목록 (작성자 조인, 삭제된 댓글 제외, 오래된 순) */
    List<CommentResponse> selectCommentsByPostId(@Param("postId") Long postId,
                                                 @Param("offset") int offset,
                                                 @Param("size") int size);

    /** 게시물의 (삭제되지 않은) 댓글 개수 — 페이징 totalCount 용 */
    long countCommentsByPostId(@Param("postId") Long postId);

    /**
     * posts.comment_count 증감. delta는 +1 / -1.
     *
     * <p>⚠️ <b>댓글 INSERT보다 먼저 호출해야 한다.</b> 순서를 뒤집으면 동시 댓글이 데드락으로
     * 유실된다 — 이유는 {@code CommentService.createComment} 주석에 적었다.
     */
    int addPostCommentCount(@Param("postId") Long postId, @Param("delta") int delta);
}

package com.helloworld.domain.like.mapper;

import com.helloworld.domain.like.entity.CommentLike;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 댓글 좋아요 RDB 매퍼. comment_likes(백업)는 SQS Worker가 채우고,
 * existsActiveComment는 좋아요 대상 검증용으로 comments를 읽기만 한다(comment 도메인 코드 비의존).
 */
@Mapper
public interface CommentLikeMapper {

    /** 존재하고 삭제되지 않은 댓글인지 (좋아요 대상 검증) */
    boolean existsActiveComment(@Param("commentId") Long commentId);

    /** 좋아요 등록 (멱등: uk_comment_likes 덕분에 중복 이벤트 무시) */
    int insertLikeIfAbsent(CommentLike commentLike);

    /** 좋아요 취소 (hard delete) */
    int deleteLike(@Param("commentId") Long commentId, @Param("userId") Long userId);
}

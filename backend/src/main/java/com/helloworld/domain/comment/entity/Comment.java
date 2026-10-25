package com.helloworld.domain.comment.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * comments 테이블 매핑 객체.
 * MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter 필요.
 * DB snake_case ↔ 여기 camelCase는 map-underscore-to-camel-case로 자동 매핑.
 *
 * [학습 포인트] Soft Delete
 *  - 댓글은 실제 행을 지우지 않고 is_deleted 플래그만 세운다(스키마의 의도).
 *  - 왜? 대댓글이 달린 댓글을 물리 삭제하면 FK 제약에 걸리고, 신고·통계 이력도 사라진다.
 *  - 대신 조회 쿼리마다 "AND is_deleted = FALSE" 조건을 빠뜨리면 안 된다.
 */
@Getter
@Setter
@NoArgsConstructor
public class Comment {

    private Long commentId;
    private Long postId;
    private Long userId;             // 작성자
    private Long parentCommentId;    // 대댓글용 self-join. 이번 범위에서는 항상 null
    private String content;
    private Boolean isDeleted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 댓글 생성 시 채우는 필드만 받는다. (플래그/시간 컬럼은 DB 기본값) */
    @Builder
    public Comment(Long postId, Long userId, String content) {
        this.postId = postId;
        this.userId = userId;
        this.content = content;
    }
}

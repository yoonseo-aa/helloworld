package com.helloworld.domain.comment.controller;

import com.helloworld.domain.comment.dto.request.CommentUpdateRequest;
import com.helloworld.domain.comment.service.CommentService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 이미 생성된 댓글에 대한 API — 수정 / 삭제.
 * comment_id만으로 대상이 특정되므로 게시물 경로에 종속시키지 않는다.
 *
 * [학습 포인트] PATCH vs PUT
 *  - PUT은 "리소스 전체 교체", PATCH는 "일부 필드 변경"이다.
 *  - 댓글은 본문만 바꾸므로 PATCH가 의미에 맞는다.
 *
 * [학습 포인트] 삭제 응답에 200 + 메시지를 쓰는 이유
 *  - 204 No Content도 표준이지만, 이 프로젝트는 모든 응답을 ApiResponse로 감싸는 규약이라
 *    바디가 있는 200이 규약과 일관된다.
 */
@RestController
@RequestMapping("/api/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    /** 댓글 수정 (PATCH /api/comments/{commentId}) — 본인 댓글만 */
    @PatchMapping("/{commentId}")
    public ResponseEntity<ApiResponse<Void>> updateComment(
            @LoginUserId Long userId,
            @PathVariable Long commentId,
            @Valid @RequestBody CommentUpdateRequest request) {
        commentService.updateComment(userId, commentId, request);
        return ResponseEntity.ok(ApiResponse.success("댓글이 수정되었습니다."));
    }

    /** 댓글 삭제 (DELETE /api/comments/{commentId}) — 본인 댓글만, soft delete */
    @DeleteMapping("/{commentId}")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
            @LoginUserId Long userId,
            @PathVariable Long commentId) {
        commentService.deleteComment(userId, commentId);
        return ResponseEntity.ok(ApiResponse.success("댓글이 삭제되었습니다."));
    }
}

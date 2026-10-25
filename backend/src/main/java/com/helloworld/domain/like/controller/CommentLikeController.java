package com.helloworld.domain.like.controller;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.service.CommentLikeService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 댓글 좋아요 API. 경로변수 표기는 be-comment의 CommentController와 동일하게 {commentId}.
 * (CommentController(/api/comments, /{commentId})와 매핑 충돌 없음 — /{commentId}/like는 별도 경로)
 */
@RestController
@RequestMapping("/api/comments/{commentId}")
@RequiredArgsConstructor
public class CommentLikeController {

    private final CommentLikeService commentLikeService;

    /** 좋아요 토글 (POST /api/comments/{commentId}/like) */
    @PostMapping("/like")
    public ResponseEntity<ApiResponse<LikeToggleResponse>> toggleLike(
            @PathVariable("commentId") Long commentId,
            @LoginUserId Long userId) {
        LikeToggleResponse data = commentLikeService.toggleLike(commentId, userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}

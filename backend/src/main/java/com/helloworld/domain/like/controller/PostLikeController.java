package com.helloworld.domain.like.controller;

import com.helloworld.domain.like.dto.response.LikeToggleResponse;
import com.helloworld.domain.like.dto.response.PostLikersResponse;
import com.helloworld.domain.like.service.PostLikeService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 게시물 좋아요 API.
 */
@RestController
@RequestMapping("/api/posts/{post_id}")
@RequiredArgsConstructor
public class PostLikeController {

    private final PostLikeService postLikeService;

    /** 좋아요 토글 (POST /api/posts/{post_id}/like) */
    @PostMapping("/like")
    public ResponseEntity<ApiResponse<LikeToggleResponse>> toggleLike(
            @PathVariable("post_id") Long postId,
            @LoginUserId Long userId) {
        LikeToggleResponse data = postLikeService.toggleLike(postId, userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /**
     * 좋아요 누른 사용자 목록 (GET /api/posts/{post_id}/likes).
     * 응답 모양은 프론트 계약(PostLikesResponse: users/next_cursor/has_next)에 맞춘다.
     */
    @GetMapping("/likes")
    public ResponseEntity<ApiResponse<PostLikersResponse>> getLikers(
            @PathVariable("post_id") Long postId,
            @RequestParam(value = "cursor", required = false) Long cursor,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        PostLikersResponse data = PostLikersResponse.from(postLikeService.getLikers(postId, cursor, size));
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}

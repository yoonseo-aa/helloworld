package com.helloworld.domain.like.controller;

import com.helloworld.domain.like.dto.response.LikedPostResponse;
import com.helloworld.domain.like.service.PostLikeService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.common.CursorResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * "특정 사용자가 좋아요한 게시물" 조회 API.
 * URL은 users 리소스 하위에 둔다. 데이터 소유권은 like 도메인(post_likes)이라 컨트롤러도 이 패키지에 둔다.
 */
@RestController
@RequestMapping("/api/users/{user_id}/liked-posts")
@RequiredArgsConstructor
public class UserLikedPostController {

    private final PostLikeService postLikeService;

    /** 좋아요한 게시물 목록 (커서 기반, 좋아요 누른 최신순 20개씩) */
    @GetMapping
    public ResponseEntity<ApiResponse<CursorResponse<LikedPostResponse>>> getLikedPosts(
            @PathVariable("user_id") Long userId,
            @RequestParam(value = "cursor", required = false) Long cursor,
            @RequestParam(value = "size", defaultValue = "20") int size) {
        CursorResponse<LikedPostResponse> data = postLikeService.getLikedPosts(userId, cursor, size);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}

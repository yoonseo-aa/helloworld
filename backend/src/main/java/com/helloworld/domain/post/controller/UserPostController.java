package com.helloworld.domain.post.controller;

import com.helloworld.domain.post.dto.response.UserPostResponse;
import com.helloworld.domain.post.service.PostService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * "특정 사용자가 작성한 게시물" 그리드 조회 API (프로필 하단 3열 썸네일).
 * URL은 users 리소스 하위지만 데이터 소유권이 posts라 컨트롤러는 post 도메인에 둔다.
 * (좋아요 그리드는 소유권이 post_likes라 like 도메인의 UserLikedPostController에 있다.)
 */
@RestController
@RequestMapping("/api/users/{user_id}/posts")
@RequiredArgsConstructor
public class UserPostController {

    private final PostService postService;

    /**
     * 유저 게시물 그리드 (커서 기반, post_id 내림차순, 기본 15개씩).
     * 본인 프로필이면 비공개 글까지, 타인 프로필이면 공개 글만 내려준다.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<CursorResponse<UserPostResponse>>> getUserPosts(
            @LoginUserId Long loginUserId,
            @PathVariable("user_id") Long userId,
            @RequestParam(value = "cursor", required = false) Long cursor,
            @RequestParam(value = "size", defaultValue = "15") int size) {
        // size 보정은 서비스가 PageSize로 일괄 처리한다(컨트롤러 중복 제거)
        CursorResponse<UserPostResponse> data = postService.getUserPosts(loginUserId, userId, cursor, size);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}

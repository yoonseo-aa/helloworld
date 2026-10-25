package com.helloworld.domain.follow.controller;

import com.helloworld.domain.follow.dto.response.FollowCountResponse;
import com.helloworld.domain.follow.dto.response.FollowListResponse;
import com.helloworld.domain.follow.dto.response.FollowToggleResponse;
import com.helloworld.domain.follow.service.FollowService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 팔로우 API. 관계·카운트 정본은 Redis(ZSET), RDB 반영은 2단계(SQS) 예정.
 * follower(거는 사람)는 @LoginUserId로 주입, URL {userId}는 대상(following).
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class FollowController {

    private final FollowService followService;

    /** 팔로우 */
    @PostMapping("/{userId}/follow")
    public ResponseEntity<ApiResponse<FollowToggleResponse>> follow(
            @PathVariable("userId") Long userId,
            @LoginUserId Long loginUserId) {
        FollowToggleResponse data = followService.follow(loginUserId, userId);
        return ResponseEntity.ok(ApiResponse.success("요청이 처리되었습니다.", data));
    }

    /** 언팔로우 */
    @DeleteMapping("/{userId}/follow")
    public ResponseEntity<ApiResponse<FollowToggleResponse>> unfollow(
            @PathVariable("userId") Long userId,
            @LoginUserId Long loginUserId) {
        FollowToggleResponse data = followService.unfollow(loginUserId, userId);
        return ResponseEntity.ok(ApiResponse.success("요청이 처리되었습니다.", data));
    }

    /** 팔로우 상태 단건 조회 (프로필 페이지 팔로우 버튼용: 팔로우 하기 / 팔로우 중) */
    @GetMapping("/{userId}/follow")
    public ResponseEntity<ApiResponse<FollowToggleResponse>> followStatus(
            @PathVariable("userId") Long userId,
            @LoginUserId Long loginUserId) {
        return ResponseEntity.ok(ApiResponse.success(followService.followStatus(loginUserId, userId)));
    }

    /** 팔로잉 수 조회 */
    @GetMapping("/{userId}/following/count")
    public ResponseEntity<ApiResponse<FollowCountResponse>> followingCount(
            @PathVariable("userId") Long userId) {
        return ResponseEntity.ok(ApiResponse.success(followService.followingCount(userId)));
    }

    /** 팔로워 수 조회 */
    @GetMapping("/{userId}/followers/count")
    public ResponseEntity<ApiResponse<FollowCountResponse>> followerCount(
            @PathVariable("userId") Long userId) {
        return ResponseEntity.ok(ApiResponse.success(followService.followerCount(userId)));
    }

    /** 팔로잉 목록 조회 (ZSET 커서 페이징) */
    @GetMapping("/{userId}/following")
    public ResponseEntity<ApiResponse<FollowListResponse>> followingList(
            @PathVariable("userId") Long userId,
            @LoginUserId Long loginUserId,
            @RequestParam(name = "cursor", required = false) Long cursor,
            @RequestParam(name = "size", defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(
                followService.followingList(loginUserId, userId, cursor, size)));
    }

    /** 팔로워 목록 조회 (ZSET 커서 페이징) */
    @GetMapping("/{userId}/followers")
    public ResponseEntity<ApiResponse<FollowListResponse>> followerList(
            @PathVariable("userId") Long userId,
            @LoginUserId Long loginUserId,
            @RequestParam(name = "cursor", required = false) Long cursor,
            @RequestParam(name = "size", defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(
                followService.followerList(loginUserId, userId, cursor, size)));
    }
}

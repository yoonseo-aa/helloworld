package com.helloworld.domain.user.controller;

import com.helloworld.domain.user.dto.request.ProfileCreateRequest;
import com.helloworld.domain.user.dto.response.ProfileResponse;
import com.helloworld.domain.user.service.ProfileService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프로필 API. HTTP 요청/응답만 담당한다.
 * - 현재 로그인 사용자(@LoginUserId)의 프로필을 생성/설정한다.
 * - 모든 입력은 선택(작성 내용 없어도 완료 가능).
 */
@RestController
@RequestMapping("/api/profiles")   // 리소스 복수형, /api/ 접두어(버전 없음)
@RequiredArgsConstructor
public class ProfileController {

    private final ProfileService profileService;

    /** 프로필 생성/설정 */
    @PostMapping
    public ResponseEntity<ApiResponse<ProfileResponse>> createProfile(
            @LoginUserId Long userId,
            @Valid @RequestBody ProfileCreateRequest request) {
        ProfileResponse data = profileService.createProfile(userId, request);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("프로필이 저장되었습니다.", data));
    }
}

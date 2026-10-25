package com.helloworld.domain.user.controller;

import com.helloworld.domain.tag.dto.response.TagResponse;
import com.helloworld.domain.user.dto.request.UserCreateRequest;
import com.helloworld.domain.user.dto.response.UserResponse;
import com.helloworld.domain.user.service.ProfileService;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 회원 API. HTTP 요청/응답만 담당한다.
 * - 비즈니스 로직 없음 (Service에 위임)
 * - Mapper 직접 호출 없음
 * - 모든 응답은 ApiResponse로 감싼다
 * 이 컨트롤러가 다른 도메인 컨트롤러의 표준 예시다.
 */
@RestController
@RequestMapping("/api/users")   // 리소스 복수형, /api/ 접두어(버전 없음)
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final ProfileService profileService;

    /** 회원 가입 */
    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            @Valid @RequestBody UserCreateRequest request) {
        UserResponse data = userService.register(request);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("회원 가입이 완료되었습니다.", data));
    }

    /** 회원 단건 조회 */
    @GetMapping("/{user_id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUser(
            @PathVariable("user_id") Long userId) {
        UserResponse data = userService.getUser(userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /** 사용자의 관심 태그 조회 (편집 화면 복원용). 인증 필요, 본인 여부는 보지 않음. 없으면 빈 배열. */
    @GetMapping("/{user_id}/interests")
    public ResponseEntity<ApiResponse<List<TagResponse>>> getUserInterests(
            @PathVariable("user_id") Long userId) {
        List<TagResponse> data = profileService.getInterests(userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /** 이메일 중복 확인 */
    @GetMapping("/check-email")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> checkEmail(
            @RequestParam("email") String email) {
        boolean available = userService.isEmailAvailable(email);
        String message = available ? "사용 가능한 이메일입니다." : "이미 가입된 이메일입니다.";
        return ResponseEntity.ok(
                ApiResponse.success(message, Map.of("is_available", available)));
    }
}

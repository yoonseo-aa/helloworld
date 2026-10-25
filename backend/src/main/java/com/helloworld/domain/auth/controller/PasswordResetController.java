package com.helloworld.domain.auth.controller;

import com.helloworld.domain.auth.dto.request.PasswordResetConfirmRequest;
import com.helloworld.domain.auth.dto.request.PasswordResetRequest;
import com.helloworld.domain.auth.service.PasswordResetService;
import com.helloworld.global.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 비밀번호 재설정 API. ({@code /api/auth/**}는 SecurityConfig에서 공개라 별도 인증 설정 불필요.)
 */
@RestController
@RequestMapping("/api/auth/password")
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService passwordResetService;

    /** 재설정 요청 — 계정 존재 여부와 무관하게 항상 200(계정 열거 방지). */
    @PostMapping("/reset-request")
    public ResponseEntity<ApiResponse<Void>> requestReset(
            @Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.requestReset(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success("비밀번호 재설정 메일을 보냈습니다."));
    }

    /** 재설정 확정 — 토큰 검증 후 새 비밀번호로 교체. */
    @PostMapping("/reset")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody PasswordResetConfirmRequest request) {
        passwordResetService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("비밀번호가 변경되었습니다."));
    }
}

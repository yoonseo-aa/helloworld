package com.helloworld.domain.auth.service;

import com.helloworld.domain.user.entity.User;
import com.helloworld.domain.user.mapper.UserMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 비밀번호 재설정 (요청 → 메일 링크 → 확정).
 *
 * <p>비번은 단방향 해시라 "찾기"가 아니라 재설정이다. 요청 단계는 만료형 토큰 링크를 메일로 보내고,
 * 확정 단계는 토큰을 1회용으로 검증한 뒤 새 비번을 재해싱해 저장한다.
 *
 * <p><b>계정 열거 방지</b>: 요청 단계는 계정 존재 여부와 무관하게 조용히 성공 처리한다
 * (호출부가 항상 200 반환). 실제 메일 발송은 LOCAL 계정이 있을 때만 일어난다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final String LOCAL_PROVIDER = "LOCAL";

    private final UserMapper userMapper;
    private final PasswordResetTokenStore tokenStore;
    private final ResetLinkSender resetLinkSender;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetRateLimiter rateLimiter;

    /** 메일 링크의 앞부분(프론트 재설정 페이지 주소). github 연동과 같은 env(APP_FRONT_BASE_URL) 재사용. */
    @Value("${app.frontend.base-url:http://localhost:3000}")
    private String frontendBaseUrl;

    /**
     * 재설정 요청. LOCAL 계정이 있을 때만 토큰을 발급해 링크를 발송한다.
     * 미가입·소셜(GOOGLE) 계정이면 아무것도 하지 않는다(열거 방지 — 호출부는 항상 성공 응답).
     */
    public void requestReset(String email) {
        // 공개 발송 엔드포인트 남용(메일 폭탄) 방지. 초과하면 조용히 종료(응답은 그대로 성공 — 열거 방지 유지).
        if (!rateLimiter.tryAcquire(email)) {
            log.warn("[PW-RESET] 레이트 리밋 초과로 발송 skip email={}", email);
            return;
        }

        Optional<User> found = userMapper.selectByEmail(email);
        if (found.isEmpty() || !LOCAL_PROVIDER.equals(found.get().getAuthProvider())) {
            return; // 없는 계정 or 비번 없는 소셜 계정 → 조용히 종료
        }

        User user = found.get();
        String token = tokenStore.issue(user.getUserId());
        // 프론트 재설정 페이지 경로(프론트가 이미 /password/reset 라우트를 가짐). API 엔드포인트와 다르다.
        String link = frontendBaseUrl + "/password/reset?token=" + token;
        try {
            resetLinkSender.send(email, link);
        } catch (RuntimeException e) {
            // 발송 실패는 응답으로 노출하지 않고(열거 방지) 서버에 남긴다 — 운영 경보 대상.
            log.error("[PW-RESET] 링크 발송 실패 email={}", email, e);
        }
    }

    /**
     * 재설정 확정. 토큰을 1회용으로 소비하고 새 비밀번호를 해싱해 저장한다.
     * 토큰이 없거나 만료/이미 사용됐으면 AUTH_RESET_TOKEN_INVALID.
     */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        Long userId = tokenStore.consume(token);
        if (userId == null) {
            throw new BusinessException(ErrorCode.AUTH_RESET_TOKEN_INVALID);
        }
        userMapper.updatePassword(userId, passwordEncoder.encode(newPassword));
    }
}

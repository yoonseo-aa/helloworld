package com.helloworld.domain.auth.service;

import com.helloworld.domain.user.entity.User;
import com.helloworld.domain.user.mapper.UserMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * PasswordResetService 단위 테스트. Mapper·토큰스토어·발송기·인코더를 목으로 대체하고 조합 로직만 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    private static final String EMAIL = "user@example.com";

    @Mock private UserMapper userMapper;
    @Mock private PasswordResetTokenStore tokenStore;
    @Mock private ResetLinkSender resetLinkSender;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private PasswordResetRateLimiter rateLimiter;

    @InjectMocks private PasswordResetService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "http://localhost:3000");
    }

    private User user(String provider, Long id) {
        User u = User.builder().authProvider(provider).email(EMAIL).build();
        u.setUserId(id);
        return u;
    }

    @Test
    @DisplayName("요청: LOCAL 계정이면 토큰을 발급하고 링크를 발송한다")
    void requestLocalUserIssuesAndSends() {
        given(rateLimiter.tryAcquire(EMAIL)).willReturn(true);
        given(userMapper.selectByEmail(EMAIL)).willReturn(Optional.of(user("LOCAL", 1L)));
        given(tokenStore.issue(1L)).willReturn("tok123");

        service.requestReset(EMAIL);

        verify(tokenStore).issue(1L);
        // 링크는 {base}/password/reset?token={토큰} 형태 (프론트 라우트에 맞춤)
        verify(resetLinkSender).send(eq(EMAIL), argThat(link -> link.contains("/password/reset?token=tok123")));
    }

    @Test
    @DisplayName("요청: 가입되지 않은 이메일이면 아무것도 하지 않는다 (열거 방지)")
    void requestUnknownEmailDoesNothing() {
        given(rateLimiter.tryAcquire(EMAIL)).willReturn(true);
        given(userMapper.selectByEmail(EMAIL)).willReturn(Optional.empty());

        service.requestReset(EMAIL);

        verify(tokenStore, never()).issue(anyLong());
        verify(resetLinkSender, never()).send(anyString(), anyString());
    }

    @Test
    @DisplayName("요청: 소셜(GOOGLE) 계정이면 비번이 없으므로 아무것도 하지 않는다")
    void requestSocialUserDoesNothing() {
        given(rateLimiter.tryAcquire(EMAIL)).willReturn(true);
        given(userMapper.selectByEmail(EMAIL)).willReturn(Optional.of(user("GOOGLE", 2L)));

        service.requestReset(EMAIL);

        verify(tokenStore, never()).issue(anyLong());
        verify(resetLinkSender, never()).send(anyString(), anyString());
    }

    @Test
    @DisplayName("요청: 레이트 리밋 초과면 조용히 종료 — 조회·토큰·발송 모두 하지 않는다")
    void requestRateLimitedSkips() {
        given(rateLimiter.tryAcquire(EMAIL)).willReturn(false);

        service.requestReset(EMAIL);

        verify(userMapper, never()).selectByEmail(anyString());
        verify(tokenStore, never()).issue(anyLong());
        verify(resetLinkSender, never()).send(anyString(), anyString());
    }

    @Test
    @DisplayName("확정: 유효 토큰이면 새 비밀번호를 해싱해 저장한다")
    void resetValidTokenUpdatesPassword() {
        given(tokenStore.consume("tok123")).willReturn(7L);
        given(passwordEncoder.encode("NewSecret123!")).willReturn("ENC");

        service.resetPassword("tok123", "NewSecret123!");

        verify(userMapper).updatePassword(7L, "ENC");
    }

    @Test
    @DisplayName("확정: 토큰이 없거나 만료/사용됐으면 AUTH_RESET_TOKEN_INVALID, 비번은 바뀌지 않는다")
    void resetInvalidTokenThrows() {
        given(tokenStore.consume("bad")).willReturn(null);

        assertThatThrownBy(() -> service.resetPassword("bad", "NewSecret123!"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AUTH_RESET_TOKEN_INVALID);

        verify(userMapper, never()).updatePassword(anyLong(), anyString());
    }
}

package com.helloworld.domain.auth.service;

import com.helloworld.domain.auth.client.GoogleOAuthClient;
import com.helloworld.domain.auth.dto.request.LoginRequest;
import com.helloworld.domain.auth.dto.request.SocialLoginRequest;
import com.helloworld.domain.user.entity.User;
import com.helloworld.domain.user.mapper.UserMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import com.helloworld.global.security.JwtTokenProvider;
import com.helloworld.global.util.EmailLoginGuide;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 인증 비즈니스 로직 (이메일 로그인 / 소셜 로그인 / 토큰 재발급 / 로그아웃).
 * - 로그인: 이메일 조회 → 비밀번호 대조 → 토큰 발급, Refresh는 Redis 저장.
 * - 소셜 로그인(구글): 인가 코드 → 구글 사용자 조회 → find-or-create → 토큰 발급.
 * - 재발급: Refresh 검증(+Redis 일치) → 새 Access 발급.
 * - 로그아웃: Refresh 무효화(Redis 삭제). 쿠키 삭제는 Controller가 처리.
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String GOOGLE_PROVIDER = "google";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenStore refreshTokenStore;
    private final GoogleOAuthClient googleOAuthClient;

    /** 발급된 토큰 쌍. Access는 응답 바디, Refresh는 쿠키로 나간다. */
    public record AuthTokens(String accessToken, String refreshToken) {}

    /** 소셜 로그인 결과. 토큰 + 회원 식별자 + 신규 여부(프론트 라우팅용). */
    public record SocialLoginResult(String accessToken, String refreshToken, Long userId, boolean isNew) {}

    /** 로그인 결과. 토큰 + 응답에 내려줄 회원 정보. */
    public record LoginResult(String accessToken, String refreshToken, Long userId, String email) {}

    /** 이메일 로그인. 실패 사유(회원없음/비번불일치)를 구분하지 않고 동일 에러로 응답한다(계정 존재 노출 방지). */
    @Transactional(readOnly = true)
    public LoginResult login(LoginRequest request) {
        User user = userMapper.selectByEmail(request.getEmail())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS));

        // 소셜 전용 계정(비밀번호 없음)은 이메일 로그인 불가
        if (user.getPassword() == null
                || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_CREDENTIALS);
        }

        AuthTokens tokens = issueTokens(user);
        return new LoginResult(tokens.accessToken(), tokens.refreshToken(),
                user.getUserId(), user.getEmail());
    }

    /**
     * 소셜 로그인(구글). 인가 코드로 구글 사용자를 조회해 (auth_provider, social_id)로 회원을 찾고,
     * 없으면 자동 가입(is_new=true), 있으면 로그인한다. 어느 쪽이든 우리 서비스의 토큰을 발급한다.
     *
     * @Transactional을 쓰지 않는다: 신규 가입은 단일 insertUser(그 자체로 원자적)뿐이고,
     * 외부 HTTP 호출(구글)을 트랜잭션 안에서 수행하면 DB 커넥션을 네트워크 대기 동안 점유하게 되기 때문.
     */
    public SocialLoginResult socialLogin(String provider, SocialLoginRequest request) {
        if (!GOOGLE_PROVIDER.equalsIgnoreCase(provider)) {
            throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM, "지원하지 않는 소셜 로그인입니다.");
        }

        GoogleOAuthClient.GoogleUserInfo info =
                googleOAuthClient.getUserInfo(request.getCode(), request.getRedirectUri());

        Optional<User> existing = userMapper.selectBySocial("GOOGLE", info.sub());

        User user;
        boolean isNew;
        if (existing.isPresent()) {
            // 기존 회원: 재로그인 시 nickname 등 사용자 수정 값을 절대 덮어쓰지 않는다(조회만).
            user = existing.get();
            isNew = false;
        } else {
            // 이메일 충돌 차단(정책 B): 같은 이메일로 이미 가입된 계정이 있으면 소셜 자동가입을 막고,
            // 기존 계정의 가입 수단에 맞는 로그인 방법을 안내한다. (email UNIQUE 위반 500 전에 명확한 409)
            User conflict = userMapper.selectByEmail(info.email()).orElse(null);
            if (conflict != null) {
                throw new BusinessException(ErrorCode.AUTH_SOCIAL_EMAIL_CONFLICT,
                        EmailLoginGuide.messageFor(conflict.getAuthProvider()));
            }
            // 신규 회원: 구글 name·picture는 저장하지 않는다(정책).
            // 닉네임·프로필 이미지는 이후 '프로필 생성' 단계에서 설정한다.
            user = User.builder()
                    .authProvider("GOOGLE")
                    .socialId(info.sub())
                    .email(info.email())
                    .nickname(null)          // 프로필 생성 단계에서 채움 (nickname NULL 허용 전제)
                    .build();
            userMapper.insertUser(user);     // insert 후 userId 채워짐
            user.setRole("USER");            // insert XML이 role='USER'로 저장 → 토큰 발급용으로 동기화
            isNew = true;
        }

        AuthTokens tokens = issueTokens(user);
        return new SocialLoginResult(tokens.accessToken(), tokens.refreshToken(), user.getUserId(), isNew);
    }

    /** Refresh Token으로 새 Access Token 발급. */
    public String reissue(String refreshToken) {
        // 유효한 Refresh 토큰만 허용 (Access 토큰을 재발급에 오용하는 것 차단)
        if (refreshToken == null || !jwtTokenProvider.validate(refreshToken)
                || !jwtTokenProvider.isRefreshToken(refreshToken)) {
            throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        }
        Long userId = jwtTokenProvider.getUserId(refreshToken);
        // Redis 정본과 일치해야 유효 (로그아웃/재로그인으로 무효화된 토큰 차단)
        if (!refreshTokenStore.matches(userId, refreshToken)) {
            throw new BusinessException(ErrorCode.AUTH_UNAUTHORIZED);
        }
        String role = jwtTokenProvider.getRole(refreshToken);
        return jwtTokenProvider.createAccessToken(userId, role);
    }

    /** 로그아웃. Refresh Token을 Redis에서 삭제해 무효화한다. 토큰이 없거나 무효여도 조용히 통과. */
    public void logout(String refreshToken) {
        if (refreshToken != null && jwtTokenProvider.validate(refreshToken)) {
            refreshTokenStore.delete(jwtTokenProvider.getUserId(refreshToken));
        }
    }

    /** Access+Refresh 발급 후 Refresh를 Redis에 저장. 로그인/소셜 로그인 공통. */
    private AuthTokens issueTokens(User user) {
        String accessToken = jwtTokenProvider.createAccessToken(user.getUserId(), user.getRole());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getUserId(), user.getRole());
        refreshTokenStore.save(user.getUserId(), refreshToken, jwtTokenProvider.getRefreshTokenValidityMs());
        return new AuthTokens(accessToken, refreshToken);
    }
}

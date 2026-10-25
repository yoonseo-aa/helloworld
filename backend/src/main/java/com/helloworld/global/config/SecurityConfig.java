package com.helloworld.global.config;

import com.helloworld.global.security.JwtAuthenticationEntryPoint;
import com.helloworld.global.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Spring Security 설정.
 * - REST API이므로 세션 사용 안 함(STATELESS), CSRF 비활성.
 * - JWT 인증 필터를 UsernamePasswordAuthenticationFilter 앞에 둔다.
 * - 인증 실패(401)는 JwtAuthenticationEntryPoint가 ApiResponse 에러 포맷으로 반환.
 *
 * 공개 URL 화이트리스트 외에는 모두 인증 필요.
 * 각 도메인에서 공개해야 할 GET 엔드포인트(예: 공개 피드 조회)가 있으면 이 화이트리스트에 추가한다.
 */
@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {}) // WebConfig의 CORS 설정 사용
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 문서 (/swagger-ui.html은 /swagger-ui/index.html로 넘겨주는 리다이렉트 주소라 따로 허용해야 함)
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        // 인증/토큰 (로그인·재발급 등)
                        .requestMatchers("/api/auth/**").permitAll()
                        // WebSocket 핸드셰이크. 브라우저 WebSocket API는 Authorization 헤더를 넣을 수 없어
                        // 핸드셰이크 단계에서는 토큰을 검사할 수 없다.
                        // 인증은 연결 직후 STOMP CONNECT 프레임에서 StompAuthChannelInterceptor가 수행하며,
                        // 통과하지 못하면 구독·발행이 전부 차단된다(빈 연결만 열림).
                        .requestMatchers("/ws/**").permitAll()
                        // 회원가입 · 이메일 중복확인 (비로그인 허용)
                        .requestMatchers(HttpMethod.POST, "/api/users").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/users/check-email").permitAll()
                        // GitHub OAuth 콜백. GitHub이 사용자의 브라우저를 이 주소로 보내는데,
                        // 브라우저 top-level 이동이라 Authorization 헤더가 실리지 않는다.
                        // 인증을 걸면 컨트롤러에 닿기도 전에 401이 나므로 열어 둔다.
                        // 대신 누가 연동하는지는 state(Redis, 일회용)로 식별한다 — GithubOAuthStateStore 참고.
                        .requestMatchers(HttpMethod.GET, "/api/github/callback").permitAll()
                        // 그 외 모든 요청은 인증 필요
                        .anyRequest().authenticated()
                )
                // 인증 없이 보호 URL 접근 시 401(AUTH_001)
                .exceptionHandling(ex -> ex.authenticationEntryPoint(jwtAuthenticationEntryPoint))
                // JWT 필터를 표준 로그인 필터 앞에 배치
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}

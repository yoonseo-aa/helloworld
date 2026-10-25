package com.helloworld.global.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * 요청마다 한 번 실행되는 JWT 인증 필터.
 * Authorization: Bearer {token} 을 추출해 유효하면 SecurityContext에 LoginUser principal을 세팅한다.
 *
 * 토큰이 없거나 만료/위조면 인증을 세팅하지 않고 그대로 통과시킨다.
 * (인증이 필요한 URL이면 이후 인가 단계에서 EntryPoint가 401을 반환한다.)
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = resolveToken(request);

        if (token != null) {
            // 토큰을 한 번만 파싱·검증한다. 유효한 Access 토큰이 아니면(만료/위조/Refresh) null.
            LoginUser principal = jwtTokenProvider.parseAccessToken(token);
            if (principal != null) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                principal, null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + principal.role())));
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }

        filterChain.doFilter(request, response);
    }

    /** Authorization 헤더에서 Bearer 토큰만 추출. 형식이 아니면 null. */
    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(bearer) && bearer.startsWith(BEARER_PREFIX)) {
            return bearer.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}

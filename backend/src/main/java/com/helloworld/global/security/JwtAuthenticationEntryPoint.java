package com.helloworld.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 인증이 필요한 URL에 인증 없이 접근했을 때 401을 우리 ApiResponse 에러 포맷으로 반환한다.
 * (인증 실패는 SecurityFilterChain 단계에서 발생하므로 GlobalExceptionHandler가 아닌
 *  이 EntryPoint가 직접 응답을 만든다.)
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(HttpServletRequest request,
                         HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        ErrorCode errorCode = ErrorCode.AUTH_UNAUTHORIZED;

        response.setStatus(errorCode.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        ApiResponse<Void> body = ApiResponse.error(errorCode.getCode(), errorCode.getMessage());
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}

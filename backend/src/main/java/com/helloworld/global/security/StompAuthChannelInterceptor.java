package com.helloworld.global.security;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * STOMP 인증 인터셉터.
 *
 * REST에서 쓰는 {@code @LoginUserId}는 HTTP 요청 기준이라 STOMP 프레임에는 동작하지 않는다.
 * 그래서 CONNECT 프레임의 native 헤더에서 토큰을 꺼내 검증하고, 통과하면 Principal을 심는다.
 * 이후 프레임(SUBSCRIBE/SEND)은 연결에 이미 붙은 Principal을 그대로 물려받는다.
 *
 * 핸드셰이크(/ws)는 SecurityConfig에서 열어두므로, 실질적인 인증 지점이 여기다.
 * 여기서 예외를 던지면 클라이언트는 ERROR 프레임을 받고 연결이 끊긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null || !StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;   // CONNECT 외의 프레임은 이미 인증된 연결 위에서 오므로 통과
        }

        String token = resolveToken(accessor);
        if (token == null) {
            throw new MessageDeliveryException("인증 정보가 없습니다.");
        }

        LoginUser loginUser = jwtTokenProvider.parseAccessToken(token);
        if (loginUser == null) {
            // 만료·위조이거나 Refresh 토큰을 보낸 경우
            throw new MessageDeliveryException("인증 정보가 유효하지 않거나 만료되었습니다.");
        }

        accessor.setUser(new StompPrincipal(loginUser.userId(), loginUser.role()));
        return message;
    }

    /**
     * CONNECT 프레임의 native 헤더에서 Bearer 토큰을 꺼낸다.
     * HTTP 헤더가 아니라 STOMP 프레임 헤더라서 getFirstNativeHeader를 쓴다.
     */
    private String resolveToken(StompHeaderAccessor accessor) {
        String bearer = accessor.getFirstNativeHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith(BEARER_PREFIX)) {
            return bearer.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}

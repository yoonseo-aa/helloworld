package com.helloworld.global.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.helloworld.domain.chat.interceptor.ChatSubscribeInterceptor;
import com.helloworld.global.security.StompAuthChannelInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.converter.DefaultContentTypeResolver;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.MessageConverter;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;

/**
 * STOMP over WebSocket 설정.
 *
 * 주소 규칙
 * - 핸드셰이크: /ws  (배포 nginx의 location /ws 와 일치해야 한다)
 * - 클라이언트 발행: /app/...   (서버 @MessageMapping이 받는다)
 * - 서버 브로드캐스트: /topic/...  (방 참여자 전체)
 * - 특정 사용자에게: /user/queue/...  (개인 알림. 3단계)
 *
 * 인증은 CONNECT 프레임에서 StompAuthChannelInterceptor가 처리한다.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor stompAuthChannelInterceptor;
    private final ChatSubscribeInterceptor chatSubscribeInterceptor;
    private final ObjectMapper objectMapper;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                // WebSocket은 WebConfig의 CORS 설정을 타지 않으므로 여기서 따로 허용해야 한다.
                // allowCredentials 상황과 마찬가지로 와일드카드(*)는 쓰지 않고 도메인을 명시한다.
                .setAllowedOriginPatterns(
                        "http://localhost:3000",
                        "https://i15e204.p.ssafy.io"
                );
        // SockJS 폴백은 쓰지 않는다. 프론트는 표준 WebSocket(@stomp/stompjs)으로 붙는다.
        // SockJS를 켜면 /ws/info 같은 부가 경로가 생겨 nginx 설정도 함께 손봐야 한다.
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 인메모리 브로커. 서버를 여러 대로 늘리면 인스턴스 간에 메시지가 공유되지 않으므로
        // 그 시점에 Redis Pub/Sub 릴레이로 교체해야 한다(아키텍처 설계서에 계획됨).
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");

        // 브로드캐스트 순서 보장.
        // 기본값(false)에서는 같은 구독자에게 보내는 메시지도 순서가 뒤바뀔 수 있어
        // 화면에 "2번 메시지 → 1번 메시지"로 그려질 수 있다.
        registry.setPreservePublishOrder(true);
    }

    /**
     * 인터셉터 순서가 중요하다. 인증이 먼저 Principal을 심어야 구독 권한 검사가 그 값을 쓸 수 있다.
     *
     * <p><b>스레드를 1개로 제한하는 이유 — 메시지 순서 보장</b>
     *
     * 기본 설정에서 이 채널은 스레드 풀로 동작하고, 한 연결에서 순서대로 도착한 프레임도
     * 여러 스레드가 동시에 처리한다. 그러면 {@code @MessageMapping} 실행 순서가 도착 순서와 달라져
     * message_id(AUTO_INCREMENT)가 전송 순서와 어긋난 채 저장된다.
     *
     * 실제로 5건을 연달아 보냈을 때 5, 2, 3, 4, 1 순서로 저장되는 것을 확인했다.
     * 채팅에서 순서는 기능의 핵심이고, 한번 뒤바뀌어 저장되면 조회에서도 영구히 뒤바뀐다.
     * 사람이 타이핑하는 속도로는 드물지만, 붙여넣기 후 연속 전송이나
     * 오프라인 큐가 한꺼번에 비워질 때 발생한다.
     *
     * 대가는 처리량이다. 모든 인바운드 프레임이 직렬 처리되므로 느린 쿼리 하나가 뒤를 막는다.
     * 현재 규모(사용자 수십 명)에서는 문제가 되지 않지만, 트래픽이 늘면
     * 세션별 순서만 보장하는 방식이나 Redis 릴레이 도입 시점에 함께 재검토해야 한다.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompAuthChannelInterceptor, chatSubscribeInterceptor);
        registration.taskExecutor()
                .corePoolSize(1)
                .maxPoolSize(1)
                .queueCapacity(1000);
    }

    /**
     * STOMP payload용 JSON 컨버터.
     *
     * 중요: STOMP는 스프링 부트가 만든 ObjectMapper를 자동으로 쓰지 않는다.
     * 그대로 두면 application.yml의 전역 SNAKE_CASE 설정이 적용되지 않아
     * REST는 room_id로 나가는데 WebSocket은 roomId로 나가는 불일치가 생긴다.
     * (Swagger에서 겪은 것과 같은 종류의 문제)
     *
     * @return true — 기본 컨버터도 함께 등록한다. 우리 컨버터가 목록 앞에 있어 우선 적용된다.
     */
    @Override
    public boolean configureMessageConverters(List<MessageConverter> messageConverters) {
        DefaultContentTypeResolver resolver = new DefaultContentTypeResolver();
        resolver.setDefaultMimeType(MimeTypeUtils.APPLICATION_JSON);

        MappingJackson2MessageConverter converter = new MappingJackson2MessageConverter();
        converter.setObjectMapper(objectMapper);
        converter.setContentTypeResolver(resolver);

        messageConverters.add(converter);
        return true;
    }
}

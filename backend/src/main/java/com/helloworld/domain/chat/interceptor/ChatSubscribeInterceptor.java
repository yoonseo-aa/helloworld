package com.helloworld.domain.chat.interceptor;

import com.helloworld.domain.chat.service.ChatRoomService;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.security.StompPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 방 topic 구독 권한 검사.
 *
 * 인증(CONNECT)만으로는 부족하다. 구독 주소는 클라이언트가 정하는 값이라,
 * 로그인한 사용자가 {@code /topic/chat/rooms/999}처럼 아무 방 번호나 넣으면
 * 참여자가 아니어도 그 방의 메시지를 계속 받아볼 수 있다.
 * 발행(SEND) 쪽은 컨트롤러에서 막지만, 구독은 컨트롤러를 거치지 않으므로 여기서 막는다.
 *
 * StompAuthChannelInterceptor 다음에 실행되어야 한다(Principal이 이미 심겨 있어야 함).
 */
@Component
@RequiredArgsConstructor
public class ChatSubscribeInterceptor implements ChannelInterceptor {

    /** /topic/chat/rooms/{roomId} 형태만 검사 대상 */
    private static final Pattern ROOM_TOPIC = Pattern.compile("^/topic/chat/rooms/(\\d+)$");

    private final ChatRoomService chatRoomService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null || !StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }

        String destination = accessor.getDestination();
        if (destination == null) {
            return message;
        }

        Matcher matcher = ROOM_TOPIC.matcher(destination);
        if (!matcher.matches()) {
            // 개인 큐(/user/queue/...)는 스프링이 Principal 기준으로 라우팅하므로
            // 남의 큐를 구독할 수 없다. 그 외 주소는 이 인터셉터의 관심사가 아니다.
            return message;
        }

        Principal user = accessor.getUser();
        if (!(user instanceof StompPrincipal principal)) {
            throw new MessageDeliveryException("인증 정보가 없습니다.");
        }

        Long roomId = Long.valueOf(matcher.group(1));
        try {
            chatRoomService.validateParticipant(roomId, principal.userId());
        } catch (BusinessException e) {
            // STOMP 구독은 HTTP가 아니므로 GlobalExceptionHandler를 타지 않는다.
            // ERROR 프레임으로 전달되도록 메시징 예외로 감싼다.
            throw new MessageDeliveryException(message, e.getMessage());
        }

        return message;
    }
}

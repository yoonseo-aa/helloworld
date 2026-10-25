package com.helloworld.domain.chat.controller;

import com.helloworld.domain.chat.dto.request.ChatMessageSendRequest;
import com.helloworld.domain.chat.dto.request.ChatReadRequest;
import com.helloworld.domain.chat.dto.response.ChatReadEvent;
import com.helloworld.domain.chat.dto.response.ChatRoomUpdateEvent;
import com.helloworld.domain.chat.dto.response.ChatStompErrorResponse;
import com.helloworld.domain.chat.service.ChatMessageService;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import com.helloworld.global.security.StompPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
// 웹(org.springframework.web.bind)의 동명 클래스가 아니다.
// STOMP payload 검증 실패는 messaging 쪽 예외로 올라온다.
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;
import org.springframework.validation.FieldError;

/**
 * 채팅 STOMP 엔드포인트.
 *
 * REST 컨트롤러와 달리 ApiResponse 봉투를 쓰지 않는다.
 * STOMP는 요청-응답이 아니라 브로드캐스트 모델이고, 구독자는 메시지 본문만 받기 때문이다.
 * 오류는 봉투가 아니라 ERROR 프레임으로 전달된다.
 *
 * 사용자 식별은 {@code @LoginUserId}가 아니라 Principal로 받는다.
 * 그 어노테이션은 HTTP 요청 기준이라 STOMP 프레임에서는 동작하지 않는다.
 */
@Controller
@RequiredArgsConstructor
public class ChatStompController {

    private static final String ROOM_TOPIC = "/topic/chat/rooms/";

    /**
     * 오류 통지용 개인 큐. 프론트가 이미 구독 중인 {@code /user/queue/updates}와 나란히 둔다.
     * ({@code @SendToUser}가 앞에 {@code /user/{sessionId}}를 붙여 보낸 사람에게만 전달한다)
     */
    private static final String ERROR_QUEUE = "/queue/errors";

    /**
     * 대화 목록·뱃지 갱신용 개인 큐. <b>주소를 바꾸면 프론트가 깨진다</b> —
     * 프론트(stompClient.ts)가 이미 이 주소를 구독하고 있어 이름을 맞췄다.
     * (내 API 명세 초안은 /queue/chat-updates였지만 프론트 구현이 먼저 있었다)
     */
    private static final String UPDATES_QUEUE = "/queue/updates";

    private final ChatMessageService chatMessageService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 메시지 전송.
     *
     * 발행: /app/chat/rooms/{roomId}/messages
     * 수신: /topic/chat/rooms/{roomId}
     *
     * {@code @SendTo}를 쓰지 않고 직접 발송하는 이유:
     * 같은 client_message_id로 재시도가 오면 새로 저장하지 않는데, 그때도 브로드캐스트하면
     * 방 사람들에게 같은 메시지가 두 번 보인다. 새로 저장된 경우에만 뿌려야 한다.
     *
     * roomId는 클라이언트가 보내는 값이므로 신뢰하지 않는다(서비스에서 참여자 검증).
     */
    @MessageMapping("/chat/rooms/{roomId}/messages")
    public void send(@DestinationVariable Long roomId,
                     @Valid @Payload ChatMessageSendRequest request,
                     StompPrincipal principal) {
        ChatMessageService.SendResult result =
                chatMessageService.send(roomId, principal.userId(), request);

        if (result.created()) {
            messagingTemplate.convertAndSend(ROOM_TOPIC + roomId, result.message());
            sendRoomUpdates(roomId, result);
        }
        // 중복 전송이면 아무것도 뿌리지 않는다.
        // 보낸 사람은 첫 전송 때 이미 브로드캐스트를 받았고, 못 받았다면
        // 재연결 후 갭 복구(GET /api/chat/rooms/{roomId}/messages?after=...)로 따라잡는다.
    }

    /**
     * 방 참여자 각자의 개인 큐로 목록 갱신을 보낸다.
     *
     * 방 topic은 그 방을 열어둔 사람만 받으므로, 목록 화면이나 다른 화면에 있는 사람은
     * 새 메시지를 알 수 없다. 그 사람들의 안읽음 뱃지를 실시간으로 갱신하는 것이 이 발송의 목적이다.
     *
     * 보낸 사람도 제외하지 않는다 — 여러 기기를 쓰면 다른 기기의 목록도 맨 위로 올라와야 한다.
     * 자기가 보낸 메시지는 자기 안읽음 수에 잡히지 않으므로(sender_id 조건) 뱃지가 잘못 늘지 않는다.
     *
     * 목적지는 {@code /user/queue/updates}이고, 스프링이 Principal.getName()(=user_id)으로
     * 각 사용자의 세션에 라우팅한다. 접속해 있지 않은 사용자에게는 그냥 버려지고 오류가 되지 않는다 —
     * 그 사람은 다음 접속 때 대화 목록 조회로 현재 상태를 받는다.
     */
    private void sendRoomUpdates(Long roomId, ChatMessageService.SendResult result) {
        result.memberUnreads().forEach(member ->
                messagingTemplate.convertAndSendToUser(
                        String.valueOf(member.getUserId()),
                        UPDATES_QUEUE,
                        ChatRoomUpdateEvent.newMessage(
                                roomId, member.getUnreadCount(), result.message())));
    }

    /**
     * 읽음 처리.
     *
     * 발행: /app/chat/rooms/{roomId}/read
     * 수신: /topic/chat/rooms/{roomId}/read
     *
     * 읽음 이벤트를 별도 주소로 보내는 이유: 메시지 주소(/topic/chat/rooms/{roomId})와 섞으면
     * 구독자가 payload를 보고 "메시지인지 읽음 알림인지" 매번 분기해야 한다.
     *
     * 읽음 위치가 실제로 앞으로 갔을 때만 뿌린다. 화면을 열어둔 채 스크롤만 해도
     * 이벤트가 계속 날아가면 상대 화면이 불필요하게 갱신된다.
     */
    @MessageMapping("/chat/rooms/{roomId}/read")
    public void read(@DestinationVariable Long roomId,
                     @Valid @Payload ChatReadRequest request,
                     StompPrincipal principal) {
        boolean moved = chatMessageService.markAsRead(
                roomId, principal.userId(), request.getLastReadMessageId());

        if (moved) {
            messagingTemplate.convertAndSend(ROOM_TOPIC + roomId + "/read",
                    ChatReadEvent.of(roomId, principal.userId(), request.getLastReadMessageId()));
        }
    }

    /**
     * STOMP 처리 중 발생한 예외를 <b>연결을 끊지 않고</b> 보낸 사람에게만 알린다.
     *
     * 이 핸들러가 없으면 스프링이 ERROR 프레임을 보내고 STOMP 규격에 따라 연결을 닫는다.
     * 그러면 프레임 하나 때문에 소켓 전체가 죽는다 — 예를 들어 방을 나간 뒤 남아 있던
     * 읽음 이벤트가 한 번 날아가면, 그 사용자의 <b>다른 모든 방 구독까지 전부 끊긴다.</b>
     *
     * REST는 GlobalExceptionHandler가 401/403/404를 돌려주고 연결은 그대로 유지되는데,
     * STOMP는 그 안전망이 없어 여기서 따로 막아야 한다.
     *
     * 개인 큐로 보내므로 다른 사용자에게는 노출되지 않는다.
     */
    @MessageExceptionHandler(BusinessException.class)
    @SendToUser(destinations = ERROR_QUEUE, broadcast = false)
    public ChatStompErrorResponse handleBusinessException(BusinessException e) {
        return ChatStompErrorResponse.of(e.getErrorCode().getCode(), e.getMessage());
    }

    /**
     * payload 검증 실패(@Valid). 1000자 초과·빈 내용·잘못된 id 형식 등.
     *
     * 잘못된 입력 하나로 연결이 끊기면 사용자는 "채팅이 갑자기 안 된다"로 겪는다.
     * 원인을 알려주고 연결은 유지한다.
     */
    @MessageExceptionHandler(MethodArgumentNotValidException.class)
    @SendToUser(destinations = ERROR_QUEUE, broadcast = false)
    public ChatStompErrorResponse handleValidationException(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("요청 형식이 올바르지 않습니다.");
        return ChatStompErrorResponse.of(ErrorCode.COMMON_INVALID_PARAM.getCode(), message);
    }
}

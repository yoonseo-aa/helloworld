package com.helloworld.domain.chat.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 메시지 전송 요청 (STOMP payload).
 * 발행 주소: /app/chat/rooms/{roomId}/messages
 */
@Getter
@NoArgsConstructor
public class ChatMessageSendRequest {

    /** 최대 길이는 팀 확정값 1000자 (기능명세서 기준). DB는 TEXT라 여유가 있다. */
    @NotBlank(message = "내용을 입력해야 합니다.")
    @Size(max = 1000, message = "메시지는 1000자를 넘을 수 없습니다.")
    private String content;

    /**
     * 클라이언트가 만든 식별자(UUID 등). 같은 값으로 다시 보내면 새로 저장하지 않고
     * 이미 저장된 메시지를 돌려준다.
     *
     * 모바일에서 전송 중 신호가 끊기면 클라이언트가 재시도하는데 서버는 이미 받았을 수 있다.
     * 이 값이 없으면(null) 중복 방지가 동작하지 않으므로 보내는 것을 권장한다.
     */
    @Size(max = 64, message = "client_message_id는 64자를 넘을 수 없습니다.")
    private String clientMessageId;
}

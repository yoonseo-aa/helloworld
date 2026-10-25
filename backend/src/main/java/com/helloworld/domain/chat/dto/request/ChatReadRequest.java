package com.helloworld.domain.chat.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 읽음 처리 요청 (STOMP payload).
 * 발행 주소: /app/chat/rooms/{roomId}/read
 *
 * "지금까지 읽었다"를 메시지 id로 표현한다. 시각이 아니라 id를 쓰는 이유는
 * 메시지 조회 커서와 같다 — 같은 초에 여러 건이 들어오면 시각으로는 경계가 모호해진다.
 */
@Getter
@NoArgsConstructor
public class ChatReadRequest {

    @NotNull(message = "읽은 메시지 id가 필요합니다.")
    @Positive(message = "읽은 메시지 id는 양수여야 합니다.")
    private Long lastReadMessageId;
}

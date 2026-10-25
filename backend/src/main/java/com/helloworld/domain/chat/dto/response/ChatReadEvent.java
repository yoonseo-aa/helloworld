package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 읽음 이벤트. 방 topic으로 브로드캐스트된다.
 *
 * 상대에게 "어디까지 읽었다"를 알려 읽음 표시를 갱신하게 한다.
 * 자기 자신도 받는다 — 여러 기기에서 같은 계정을 쓰면 다른 기기의 읽음 상태도 맞춰진다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatReadEvent {

    private Long roomId;

    /** 읽은 사람 */
    private Long userId;

    private Long lastReadMessageId;
    private LocalDateTime readAt;

    public static ChatReadEvent of(Long roomId, Long userId, Long lastReadMessageId) {
        return new ChatReadEvent(roomId, userId, lastReadMessageId, LocalDateTime.now());
    }
}

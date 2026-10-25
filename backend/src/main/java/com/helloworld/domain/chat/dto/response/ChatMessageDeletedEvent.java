package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 메시지 삭제 이벤트. 방 topic으로 브로드캐스트된다.
 *
 * 이미 화면에 그려진 메시지를 바꿔야 하므로 실시간 통지가 필요하다.
 * 통지가 없으면 상대는 새로고침할 때까지 원문을 계속 보게 된다.
 *
 * 대체 문구를 서버가 함께 내려준다 — 프론트가 문구를 각자 하드코딩하면
 * 실시간 표시와 과거 조회 표시가 달라질 수 있다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatMessageDeletedEvent {

    private Long roomId;
    private Long messageId;
    private String content;
    private Boolean isDeleted;
    private LocalDateTime deletedAt;

    public static ChatMessageDeletedEvent of(Long roomId, Long messageId, String placeholder) {
        return new ChatMessageDeletedEvent(roomId, messageId, placeholder, true, LocalDateTime.now());
    }
}

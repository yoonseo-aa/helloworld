package com.helloworld.domain.chat.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 채팅 메시지 (dm_messages).
 *
 * 삭제는 hard delete가 아니라 {@code deletedAt}을 채우는 soft delete다(팀 확정).
 * 대화 흐름에서 메시지가 통째로 사라지면 앞뒤 문맥이 끊기므로,
 * 조회 시 본문을 "삭제된 메시지입니다"로 바꿔 자리는 남긴다.
 */
@Getter
@NoArgsConstructor
public class DmMessage {

    private Long messageId;
    private Long roomId;
    private Long senderId;
    private String messageType;
    private String content;

    /** 클라이언트가 만든 식별자. (room_id, sender_id, client_message_id) UNIQUE로 중복 전송을 막는다. */
    private String clientMessageId;

    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;

    @Builder
    public DmMessage(Long messageId, Long roomId, Long senderId, String messageType,
                     String content, String clientMessageId,
                     LocalDateTime deletedAt, LocalDateTime createdAt) {
        this.messageId = messageId;
        this.roomId = roomId;
        this.senderId = senderId;
        this.messageType = messageType;
        this.content = content;
        this.clientMessageId = clientMessageId;
        this.deletedAt = deletedAt;
        this.createdAt = createdAt;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }
}

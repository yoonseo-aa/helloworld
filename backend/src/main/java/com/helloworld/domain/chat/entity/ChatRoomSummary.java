package com.helloworld.domain.chat.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 대화 목록 한 행의 조회 결과(매퍼 전용).
 *
 * 엔티티 하나에 대응하지 않고 여러 테이블을 묶은 결과라 별도 타입을 둔다.
 * (DmRoom에 억지로 필드를 붙이면 방 정보가 아닌 값이 섞여 의미가 흐려진다)
 */
@Getter
@NoArgsConstructor
public class ChatRoomSummary {

    private Long roomId;
    private String roomType;
    private String title;

    /** 내 읽음 위치. 안읽음 수 계산에 이미 쓰였지만 프론트 검증용으로 함께 내린다 */
    private Long lastReadMessageId;

    /** 마지막 메시지. 메시지가 아직 없는 방은 전부 null */
    private Long lastMessageId;
    private Long lastSenderId;
    private String lastContent;
    private LocalDateTime lastDeletedAt;
    private LocalDateTime lastSentAt;

    private int unreadCount;

    public boolean hasMessage() {
        return lastMessageId != null;
    }

    public boolean isLastMessageDeleted() {
        return lastDeletedAt != null;
    }
}

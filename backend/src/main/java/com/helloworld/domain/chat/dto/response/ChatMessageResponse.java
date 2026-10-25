package com.helloworld.domain.chat.dto.response;

import com.helloworld.domain.chat.entity.DmMessage;
import com.helloworld.domain.chat.service.ChatMessageService;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 메시지 한 건. STOMP 브로드캐스트와 REST 조회에서 같은 형태로 쓴다.
 *
 * 같은 DTO를 쓰는 이유: 프론트가 실시간으로 받은 메시지와 과거 조회로 받은 메시지를
 * 같은 코드로 렌더링할 수 있다. 형태가 다르면 분기 처리가 늘고 실수가 생긴다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatMessageResponse {

    private Long messageId;
    private Long roomId;
    private Long senderId;
    private String messageType;
    private String content;
    private String clientMessageId;

    /**
     * primitive `boolean`이 아니라 래퍼 `Boolean`인 이유 (실수하기 쉬운 지점).
     *
     * Lombok은 `boolean isDeleted` 필드에 `isDeleted()` 게터를 만들고,
     * Jackson은 boolean 게터의 `is` 접두어를 떼어내 프로퍼티명을 `deleted`로 본다.
     * 그러면 JSON이 `is_deleted`가 아니라 `deleted`로 나가 규약(`is_liked`/`is_following`)과 어긋난다.
     *
     * `Boolean`으로 두면 게터가 `getIsDeleted()`가 되어 프로퍼티명이 `isDeleted` → `is_deleted`가 된다.
     * `ChatRoomCreateResponse.isNew`도 같은 이유로 래퍼를 쓴다.
     * (DTO마다 @JsonProperty를 붙이지 않는다는 규약을 지키면서 해결하는 방법)
     */
    private Boolean isDeleted;

    private LocalDateTime sentAt;

    /**
     * 삭제된 메시지는 본문을 내리지 않는다.
     * DB에는 원문이 남아 있어도 응답에서 지워야 한다 — 그러지 않으면
     * 프론트가 화면에만 가리고 개발자 도구에서는 원문이 보인다.
     */
    public static ChatMessageResponse from(DmMessage message) {
        boolean deleted = message.isDeleted();
        return new ChatMessageResponse(
                message.getMessageId(),
                message.getRoomId(),
                message.getSenderId(),
                message.getMessageType(),
                deleted ? ChatMessageService.DELETED_PLACEHOLDER : message.getContent(),
                message.getClientMessageId(),
                deleted,
                message.getCreatedAt()
        );
    }
}

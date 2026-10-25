package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 개인 큐(/user/queue/updates)로 보내는 대화 목록 갱신 이벤트.
 *
 * 방 topic(/topic/chat/rooms/{roomId})은 <b>그 방에 들어가 있는 사람</b>만 받는다.
 * 그래서 목록 화면이나 다른 화면에 있는 사람은 새 메시지가 온 것을 알 수 없고,
 * 메인 화면 안읽음 뱃지가 새로고침 전까지 그대로 남는다. 이 이벤트가 그 구멍을 메운다.
 *
 * <p><b>type이 있는 이유</b>: 이 큐는 채팅 전용이 아니다.
 * 프론트가 하나의 개인 큐를 채팅·알림이 함께 쓰도록 만들어 두었고(payload 종류로 분기),
 * 알림 기능이 붙으면 같은 주소로 다른 형태가 흐른다. 구분자가 없으면 그때 프론트가 추측해야 한다.
 *
 * <p><b>unreadCount는 절대값이다(증가분이 아니다).</b>
 * 프론트는 room_id → unread_count 맵을 갱신하고 그 합으로 전체 뱃지를 계산한다.
 * 증가분으로 보내면 이벤트가 한 번 유실되거나 두 번 도착할 때 뱃지가 영구히 어긋난다
 * (재연결 중 유실은 실제로 일어난다). 절대값은 늦게 도착해도 마지막 값이 맞으면 결국 맞는다.
 *
 * <p>전체 합계를 서버가 계산해 주지 않는 이유: 사람마다 자기가 속한 <b>모든 방</b>을 훑어야 해서,
 * 메시지 한 건 보낼 때마다 참여자 수 × 방 수만큼 일이 늘어난다. 전송은 가장 잦은 동작이라
 * 여기에 비용을 두면 안 된다. 프론트가 맵의 합으로 구하는 편이 정확하고 싸다(프론트와 합의).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatRoomUpdateEvent {

    /** 이 큐를 공유하는 다른 payload와 구분하는 값. 채팅 새 메시지는 CHAT_MESSAGE. */
    private String type;

    private Long roomId;

    /** 받는 사람 기준 그 방의 안읽음 수(절대값) */
    private Integer unreadCount;

    /**
     * 목록에 미리보기로 표시할 마지막 메시지.
     *
     * 방 topic으로 가는 것과 같은 DTO를 쓴다 — 프론트가 두 경로에서 온 메시지를
     * 같은 코드로 다룰 수 있어야 한다.
     */
    private ChatMessageResponse message;

    private static final String TYPE_CHAT_MESSAGE = "CHAT_MESSAGE";

    public static ChatRoomUpdateEvent newMessage(Long roomId, Integer unreadCount,
                                                 ChatMessageResponse message) {
        return new ChatRoomUpdateEvent(TYPE_CHAT_MESSAGE, roomId, unreadCount, message);
    }
}

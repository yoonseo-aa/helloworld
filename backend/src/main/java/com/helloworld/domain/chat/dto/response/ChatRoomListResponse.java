package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

/**
 * 대화 목록 응답. 최신 대화가 먼저 온다.
 *
 * 커서가 값 두 개인 이유: 정렬 키가 (마지막 메시지 id, room_id)이기 때문이다.
 * 마지막 메시지 id만으로는 값이 같은 방들 — 특히 메시지가 아직 없어 0으로 묶이는 방들 —
 * 에서 경계가 모호해져 다음 페이지에서 누락이나 중복이 생긴다.
 *
 * 프론트는 page_info의 두 값을 다음 요청의 before_last_message_id / before_room_id에
 * 그대로 넣으면 된다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatRoomListResponse {

    private List<ChatRoomSummaryResponse> rooms;
    private PageInfo pageInfo;

    public static ChatRoomListResponse of(List<ChatRoomSummaryResponse> rooms, boolean hasNext) {
        Long lastMessageId = null;
        Long lastRoomId = null;
        if (!rooms.isEmpty()) {
            ChatRoomSummaryResponse tail = rooms.get(rooms.size() - 1);
            lastMessageId = tail.getLastMessage() == null ? 0L : tail.getLastMessage().getMessageId();
            lastRoomId = tail.getRoomId();
        }
        return new ChatRoomListResponse(rooms, new PageInfo(hasNext, lastMessageId, lastRoomId));
    }

    @Getter
    @AllArgsConstructor(access = AccessLevel.PRIVATE)
    public static class PageInfo {
        private boolean hasNext;

        /** 다음 요청의 before_last_message_id로 그대로 사용 */
        private Long nextCursorLastMessageId;

        /** 다음 요청의 before_room_id로 그대로 사용 */
        private Long nextCursorRoomId;
    }
}

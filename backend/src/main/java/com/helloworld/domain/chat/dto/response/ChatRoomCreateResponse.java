package com.helloworld.domain.chat.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * 채팅방 생성/재사용 응답. JSON은 snake_case로 나감 (room_id, room_type, is_new).
 *
 * isNew: true면 새로 만들어진 방. 프론트 동작은 동일하지만(입장 후 메시지 0건이면 빈 화면),
 *        안내 문구를 다르게 하고 싶을 때 쓴다.
 */
@Getter
@Builder
public class ChatRoomCreateResponse {

    private Long roomId;
    private String roomType;
    private Boolean isNew;

    public static ChatRoomCreateResponse of(Long roomId, String roomType, boolean isNew) {
        return ChatRoomCreateResponse.builder()
                .roomId(roomId)
                .roomType(roomType)
                .isNew(isNew)
                .build();
    }
}

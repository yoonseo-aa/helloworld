package com.helloworld.domain.chat.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 대화 목록에 표시할 상대방 1명(매퍼 전용).
 *
 * DIRECT 방은 1명, GROUP 방은 여러 명이 나온다.
 * 방 목록을 받은 뒤 room_id들을 한 번에 넣어 조회하고 자바에서 방별로 묶는다 —
 * 방마다 따로 조회하면 N+1이 된다.
 */
@Getter
@NoArgsConstructor
public class ChatRoomCounterpart {

    private Long roomId;
    private Long userId;
    private String nickname;
    private String profileImageUrl;

    /** 이 사람이 어디까지 읽었는지 (읽음 표시용). 아직 안 읽었으면 null */
    private Long lastReadMessageId;
}

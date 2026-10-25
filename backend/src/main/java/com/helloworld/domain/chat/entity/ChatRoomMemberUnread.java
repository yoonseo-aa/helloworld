package com.helloworld.domain.chat.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 한 방의 참여자 1명과 그 사람의 안읽음 수(매퍼 전용).
 *
 * 메시지가 저장된 직후, 그 방 사람들에게 개인 큐로 갱신을 보낼 때 쓴다.
 * 안읽음 수는 사람마다 다르므로(각자 읽은 위치가 다르다) 참여자별로 값이 필요하다.
 * 참여자마다 따로 조회하면 N+1이 되므로 한 번의 쿼리로 방 전체를 받는다.
 */
@Getter
@NoArgsConstructor
public class ChatRoomMemberUnread {

    private Long userId;
    private Integer unreadCount;
}

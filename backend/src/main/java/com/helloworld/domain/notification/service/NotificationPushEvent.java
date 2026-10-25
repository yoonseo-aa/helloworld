package com.helloworld.domain.notification.service;

import com.helloworld.domain.notification.dto.response.NotificationResponse;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 개인 큐({@code /user/queue/updates})로 보내는 새 알림 payload.
 *
 * <p><b>{@code type}이 최상단에 있는 이유</b>: 이 큐는 채팅과 함께 쓴다. 프론트가 하나의 큐를
 * 구독하고 {@code type}으로 분기해 각 기능에 넘긴다(채팅은 {@code CHAT_MESSAGE}).
 * 알림은 {@code NOTIFICATION}이고, 어떤 종류의 알림인지는 안쪽 {@code notification.type}
 * (FOLLOW / LIKE / COMMENT)에 있다.
 *
 * <p><b>{@code unread_count}를 함께 보내는 이유</b>: 알림 뱃지는 "안 읽은 알림 수" 하나뿐이라
 * 채팅처럼 방별로 나눌 필요가 없다. 서버가 세서 보내면 프론트는 그 값을 그대로 표시하면 되고,
 * 증가분을 누적하지 않으므로 <b>이벤트가 유실되거나 중복돼도 뱃지가 어긋나지 않는다</b>.
 * (채팅에서 절대값을 보내기로 한 것과 같은 이유다 — 증가분은 한 번 틀리면 영구히 틀린다)
 *
 * <p>{@code notification}은 목록 조회와 <b>같은 DTO</b>라 프론트가 분기 없이 렌더링할 수 있다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class NotificationPushEvent {

    private static final String TYPE_NOTIFICATION = "NOTIFICATION";

    /** 이 큐를 공유하는 다른 payload와 구분하는 값 */
    private String type;

    private NotificationResponse notification;

    /** 받는 사람의 안 읽은 알림 수(절대값) */
    private Integer unreadCount;

    public static NotificationPushEvent of(NotificationResponse notification, int unreadCount) {
        return new NotificationPushEvent(TYPE_NOTIFICATION, notification, unreadCount);
    }
}

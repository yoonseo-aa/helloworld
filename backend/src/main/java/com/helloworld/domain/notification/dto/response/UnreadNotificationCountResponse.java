package com.helloworld.domain.notification.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 안 읽은 알림 수. 헤더·사이드바 뱃지의 초기값으로 쓴다.
 *
 * <p>숫자 하나를 굳이 객체로 감싸는 이유: 응답은 항상 {@code data} 안에 객체를 담는 형태라
 * 프론트가 같은 방식으로 꺼낼 수 있고, 나중에 "종류별 개수" 같은 필드를 추가할 때
 * 응답 구조를 깨지 않는다. 채팅의 {@code unread-count}도 같은 형태다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class UnreadNotificationCountResponse {

    private Integer unreadCount;

    public static UnreadNotificationCountResponse of(int unreadCount) {
        return new UnreadNotificationCountResponse(unreadCount);
    }
}

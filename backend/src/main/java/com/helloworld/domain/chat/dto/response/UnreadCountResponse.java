package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 전체 안읽음 수. 헤더·탭의 뱃지 숫자에 쓴다.
 * 방별 안읽음 수는 대화 목록 응답에 이미 포함되어 있으므로 여기서는 합계만 내린다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class UnreadCountResponse {

    private int unreadCount;

    public static UnreadCountResponse of(int unreadCount) {
        return new UnreadCountResponse(unreadCount);
    }
}

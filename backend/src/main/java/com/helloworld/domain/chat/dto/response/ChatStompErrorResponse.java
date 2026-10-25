package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * STOMP 처리 오류를 보낸 사람에게만 알리는 응답. 개인 큐로 전달된다.
 *
 * REST의 에러 봉투({@code status, code, message})와 필드 이름을 맞췄다.
 * 프론트가 REST와 STOMP 오류를 같은 방식으로 다룰 수 있게 하기 위함이다.
 * 다만 STOMP는 HTTP가 아니므로 상태 코드는 없다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatStompErrorResponse {

    private static final String STATUS_ERROR = "ERROR";

    private String status;
    private String code;
    private String message;

    public static ChatStompErrorResponse of(String code, String message) {
        return new ChatStompErrorResponse(STATUS_ERROR, code, message);
    }
}

package com.helloworld.global.security;

import java.security.Principal;

/**
 * STOMP 연결에 심는 사용자 식별 정보.
 *
 * getName()이 user_id 문자열이어야 하는 이유:
 * 스프링의 개인 큐(`/user/queue/...`) 라우팅이 Principal.getName()을 목적지 키로 쓴다.
 * 여기에 사람이 읽는 이름이나 toString 결과가 들어가면 특정 사용자에게 보내는 알림이 엉뚱한 곳으로 간다.
 *
 * REST의 {@link LoginUser}와 역할은 같지만, REST는 SecurityContext를 쓰고
 * STOMP는 Principal을 쓰기 때문에 별도 타입으로 둔다.
 */
public record StompPrincipal(Long userId, String role) implements Principal {

    @Override
    public String getName() {
        return String.valueOf(userId);
    }
}

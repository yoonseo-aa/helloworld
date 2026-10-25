package com.helloworld.domain.auth.service;

/**
 * 비밀번호 재설정 링크 전달 통로.
 *
 * <p>구현체를 바꿔 <b>개발(로그) ↔ 운영(이메일)</b>을 전환한다. 흐름(토큰 발급·검증) 코드는
 * 이 인터페이스에만 의존하므로, 이메일 발송을 붙일 때 구현체 하나만 추가하면 된다.
 * (운영용 {@code GmailResetLinkSender}는 spring-boot-starter-mail 의존성 도입 후 추가 예정.)
 */
public interface ResetLinkSender {

    /**
     * 재설정 링크를 사용자에게 전달한다.
     *
     * @param email     수신자 이메일
     * @param resetLink 프론트 재설정 페이지 링크(토큰 포함)
     */
    void send(String email, String resetLink);
}

package com.helloworld.domain.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 개발용 링크 전달: 실제 메일 대신 <b>로그로 출력</b>한다. 이메일 인프라·자격증명 없이 전체 흐름을
 * 완성·검증하기 위한 골격 구현체다.
 *
 * <p>{@code app.mail.enabled=false}(기본)일 때 활성. 운영에서 {@code true}로 켜면
 * {@link GmailResetLinkSender}가 대신 등록된다. (SQS enabled 플래그와 같은 방식)
 *
 * <p><b>⚠️ 운영 주의</b>: 재설정 링크를 로그에 남기는 것은 그 자체로 보안 구멍이다 —
 * 운영에서는 반드시 {@code app.mail.enabled=true}로 Gmail 발송을 쓴다.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "false", matchIfMissing = true)
public class LogResetLinkSender implements ResetLinkSender {

    @Override
    public void send(String email, String resetLink) {
        log.info("[PW-RESET] 재설정 링크 발송(로그 대체) to={} link={}", email, resetLink);
    }
}

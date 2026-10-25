package com.helloworld.domain.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * 운영용 링크 전달: 재설정 링크를 <b>이메일(Gmail SMTP)</b>로 발송한다.
 *
 * <p>{@code app.mail.enabled=true}일 때만 빈으로 등록된다({@link LogResetLinkSender}와 배타적).
 * 켜려면 {@code spring.mail.username}/{@code password}(= MAIL_USERNAME/MAIL_APP_PASSWORD)가
 * 채워져 있어야 한다. 값이 비어 있으면 발송 시점에 SMTP 인증이 실패한다(기동은 정상).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "true")
@RequiredArgsConstructor
public class GmailResetLinkSender implements ResetLinkSender {

    private final JavaMailSender mailSender;

    /** From 주소. Gmail은 인증 계정에서만 보낼 수 있으므로 발신자를 계정 주소로 맞춘다. */
    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Override
    public void send(String email, String resetLink) {
        SimpleMailMessage message = new SimpleMailMessage();
        if (fromAddress != null && !fromAddress.isBlank()) {
            message.setFrom(fromAddress);
        }
        message.setTo(email);
        message.setSubject("[Hello World] 비밀번호 재설정 안내");
        message.setText(
                "아래 링크에서 비밀번호를 재설정하세요. (30분간 유효)\n\n"
                        + resetLink + "\n\n"
                        + "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.");
        mailSender.send(message);
    }
}

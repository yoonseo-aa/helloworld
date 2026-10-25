package com.helloworld.domain.auth.client;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 구글 OAuth 설정. 값은 코드에 하드코딩하지 않고 application-local.yml/환경변수에서 주입한다.
 * (client-secret 같은 민감정보는 절대 커밋 대상 파일에 넣지 않는다.)
 */
@Component
@ConfigurationProperties(prefix = "oauth.google")
@Getter
@Setter
public class GoogleOAuthProperties {

    private String clientId;
    private String clientSecret;
    private String tokenUri;
    private String userinfoUri;
}

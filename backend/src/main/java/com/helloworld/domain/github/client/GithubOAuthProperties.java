package com.helloworld.domain.github.client;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * GitHub OAuth 설정. 값은 코드에 하드코딩하지 않고 application-local.yml/환경변수에서 주입한다.
 * (client-secret, token-encryption-key 같은 민감정보는 커밋 대상 파일에 넣지 않는다.)
 */
@Component
@ConfigurationProperties(prefix = "oauth.github")
@Getter
@Setter
public class GithubOAuthProperties {

    private String clientId;
    private String clientSecret;
    private String authorizeUri;  // https://github.com/login/oauth/authorize
    private String tokenUri;      // https://github.com/login/oauth/access_token
    // 사용자 정보는 GraphQL viewer가 잔디와 함께 주므로 REST /user 엔드포인트는 쓰지 않는다.
    private String graphqlUri;    // https://api.github.com/graphql

    /**
     * GitHub이 승인 후 브라우저를 되돌려 보낼 주소. <b>우리 백엔드의 콜백 엔드포인트</b>다.
     * GitHub OAuth App에 등록한 Authorization callback URL과 <b>문자 하나까지 일치</b>해야 한다.
     * 예) https://i15e204.p.ssafy.io/api/github/callback
     */
    private String redirectUri;

    /**
     * 인가 요청 scope. {@code repo}가 있어야 비공개 저장소 커밋이 잔디에 포함된다.
     * GitHub OAuth App에는 "private 읽기 전용" scope가 없어 repo 하나로 읽기·쓰기가 묶여 있다.
     */
    private String scope;

    /**
     * 연동을 마친 뒤 사용자를 되돌려 보낼 프론트 주소의 베이스.
     * 여기에 {@code /users/{userId}} 를 붙여 본인 프로필로 보낸다.
     * (지금은 github 도메인만 쓰지만, 다른 곳에서도 필요해지면 공용 설정으로 옮긴다.)
     */
    private String frontBaseUrl;

    /**
     * DB에 저장할 access token을 암호화할 대칭키(Base64 인코딩된 16/24/32바이트).
     * GitHub access token은 사용자를 대신해 API를 호출할 수 있는 자격증명이라 평문 저장하지 않는다.
     */
    private String tokenEncryptionKey;
}

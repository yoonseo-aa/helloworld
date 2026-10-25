package com.helloworld.domain.github.dto.request;

import lombok.Getter;

/**
 * GitHub 연동 요청.
 *
 * <p>code는 <b>선택</b>이다. 명세대로 GitHub으로 로그인한 사용자는 이미 서버가 토큰을 갖고
 * 있으므로 Body 없이 요청하고, 일반 로그인 사용자만 GitHub 인가 화면에서 받은
 * Authorization Code를 담아 보낸다.
 *
 * <p>Body 자체가 없을 수 있어 Controller에서 {@code @RequestBody(required = false)}로 받는다.
 * 그래서 여기에 {@code @NotBlank}를 걸면 안 된다 — "코드가 없어도 되는 경우"를
 * 유효성 단계에서 거를 수 없기 때문에, 실제 판단은 Service가 한다.
 */
@Getter
public class GithubConnectRequest {

    /** GitHub OAuth Authorization Code. 일반 로그인 사용자는 필수, GitHub 로그인 사용자는 불필요. */
    private String code;
}

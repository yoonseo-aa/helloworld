package com.helloworld.domain.github.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * GitHub 인가 URL 응답 (GET /api/github/authorize).
 *
 * <p>프론트는 이 URL로 {@code window.location.href} 이동만 하면 된다.
 * client_id·scope·state 조립을 서버가 하므로 프론트에 client_id를 둘 필요가 없고,
 * state 검증도 서버가 책임진다.
 *
 * <p>이 API가 302 리다이렉트가 아니라 JSON인 이유: 브라우저의 top-level 이동에는
 * {@code Authorization} 헤더를 실을 수 없어서, "누가 연동을 시작하는지"를 알려면
 * 프론트가 fetch로 호출해 URL만 받아 가야 한다.
 */
@Getter
@Builder
public class GithubAuthorizeResponse {

    /** 이 주소로 브라우저를 이동시키면 GitHub 승인 화면이 뜬다. state가 이미 포함돼 있다. */
    private String authorizeUrl;
}

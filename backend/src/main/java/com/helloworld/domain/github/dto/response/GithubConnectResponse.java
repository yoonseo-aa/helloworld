package com.helloworld.domain.github.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * GitHub 연동 응답. JSON은 snake_case로 나간다
 * (github_connected / github_id / github_login / last_synced_at).
 *
 * access_token은 어떤 경우에도 담지 않는다.
 */
@Getter
@Builder
public class GithubConnectResponse {

    private boolean githubConnected;
    private Long githubId;
    private String githubLogin;

    /** 마지막 잔디 동기화 완료 시각. 최초 연동 직후 동기화까지 마쳤다면 그 시각이 들어간다. */
    private LocalDateTime lastSyncedAt;
}

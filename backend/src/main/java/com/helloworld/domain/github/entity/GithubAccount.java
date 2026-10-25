package com.helloworld.domain.github.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * github_accounts 테이블 매핑 객체.
 * MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter가 필요.
 *
 * accessToken은 암호화된 값이다. 평문이 필요하면 GithubTokenCipher로 복호화해서 쓰고,
 * 어떤 응답 DTO에도 담지 않는다.
 */
@Getter
@Setter
@NoArgsConstructor
public class GithubAccount {

    private Long githubAccountId;
    private Long userId;
    private Long githubId;
    private String githubLogin;
    private String accessToken;        // 암호화 저장
    private LocalDateTime lastSyncedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Builder
    public GithubAccount(Long userId, Long githubId, String githubLogin, String accessToken) {
        this.userId = userId;
        this.githubId = githubId;
        this.githubLogin = githubLogin;
        this.accessToken = accessToken;
    }
}

package com.helloworld.domain.user.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * users 테이블 매핑 객체 (마스터 ERD 기준).
 * MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter가 필요.
 * DB의 snake_case ↔ 여기 camelCase는 mybatis map-underscore-to-camel-case로 자동 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class User {

    private Long userId;
    private String authProvider;   // LOCAL, GOOGLE
    private String socialId;
    private String loginId;
    private String password;
    private String email;
    private String nickname;       // 서비스 내 닉네임 (검색 대상)
    private String profileImageUrl;
    private String introduce;      // 한줄소개 (프로필 생성 단계에서 설정)
    private String githubUsername;
    private String role;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Builder
    public User(String authProvider, String socialId, String loginId, String password,
                String email, String nickname, String profileImageUrl, String githubUsername) {
        this.authProvider = authProvider;
        this.socialId = socialId;
        this.loginId = loginId;
        this.password = password;
        this.email = email;
        this.nickname = nickname;
        this.profileImageUrl = profileImageUrl;
        this.githubUsername = githubUsername;
    }
}

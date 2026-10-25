package com.helloworld.domain.post.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * posts 테이블 매핑 객체 (마스터 ERD 기준).
 * MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter 필요.
 * DB snake_case ↔ 여기 camelCase는 map-underscore-to-camel-case로 자동 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class Post {

    private Long postId;
    private Long userId;          // 작성자
    private String postType;      // PROJECT, CARD_NEWS
    private String content;       // Markdown
    private String thumbnailUrl;
    private String githubUrl;     // GitHub Repository URL (PROJECT)
    private String projectLink;   // iframe 시연 URL (= 요청의 deploy_url)
    private String aiSummary;     // 프로젝트 요약 (= 요청의 summary)
    private Integer viewCount;
    private Integer likeCount;    // Redis 정본의 백업 캐시
    private Integer commentCount;
    private Boolean isPublic;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 게시물 생성 시 채우는 필드만 받는다. (카운트/공개여부/시간은 DB 기본값) */
    @Builder
    public Post(Long userId, String postType, String content, String thumbnailUrl,
                String githubUrl, String projectLink, String aiSummary) {
        this.userId = userId;
        this.postType = postType;
        this.content = content;
        this.thumbnailUrl = thumbnailUrl;
        this.githubUrl = githubUrl;
        this.projectLink = projectLink;
        this.aiSummary = aiSummary;
    }
}

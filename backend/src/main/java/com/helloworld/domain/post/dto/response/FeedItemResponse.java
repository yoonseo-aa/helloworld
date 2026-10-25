package com.helloworld.domain.post.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 메인 피드 목록의 각 게시물 항목.
 *
 * <p>매핑 출처가 셋이라 조회 후 Service가 조합한다:
 * <ul>
 *   <li>post_id/post_type/content/comment_count/created_at/thumbnail_url/author : posts+users 조인(MyBatis resultMap).
 *       thumbnail_url이 없으면(주로 CARD_NEWS) 첫 IMAGE 미디어로 COALESCE 폴백</li>
 *   <li>tech_stacks : post_tags→tags 배치 조회로 채움</li>
 *   <li>like_count/is_liked : Redis 정본(post:like:*) 배치 조회로 채움</li>
 * </ul>
 *
 * <p>{@code isLiked}는 primitive boolean이 아닌 Boolean 래퍼 — JSON 키를 is_liked로 내보내기 위함.
 *
 * <p>{@code pinned}는 팔로우 상단 고정 여부(작성자가 팔로우 대상 && 최근 30분). 조회 SQL이 계산해 내려주며,
 * 다음 페이지 커서(FeedCursor)를 만들 때만 쓰는 내부 값이라 {@code @JsonIgnore}로 응답에는 노출하지 않는다.
 */
@Getter
@Setter
@NoArgsConstructor
public class FeedItemResponse {

    private Long postId;
    private String postType;          // PROJECT / CARD_NEWS
    private PostAuthorResponse author;
    private String content;
    private String thumbnailUrl;      // posts.thumbnail_url (CARD_NEWS 등 null이면 첫 IMAGE 미디어로 폴백)
    private List<String> techStacks;  // post_tags→tags 태그명 목록
    private Long likeCount;
    private Integer commentCount;
    private Boolean isLiked;
    private LocalDateTime createdAt;

    /** 팔로우 상단 고정 여부(커서 계산 전용, 응답 미노출) */
    @JsonIgnore
    private Boolean pinned;
}

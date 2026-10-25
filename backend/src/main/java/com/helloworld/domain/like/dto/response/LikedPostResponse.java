package com.helloworld.domain.like.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * "내가 좋아요한 게시물" 목록의 항목 1개.
 * post_likes를 기준으로 posts/users(작성자)를 JOIN한 결과를 MyBatis가 바로 매핑한다.
 */
@Getter
@Setter
@NoArgsConstructor
public class LikedPostResponse {

    private Long likeId;               // 커서로 쓰는 값 (post_likes.like_id)
    private Long postId;
    private String postType;           // PROJECT, CARD_NEWS
    private String content;
    private String thumbnailUrl;
    private Long likeCount;
    private Long commentCount;
    private Long authorId;
    private String authorNickname;
    private String authorProfileImageUrl;
    private LocalDateTime likedAt;      // 내가 좋아요를 누른 시각 (post_likes.created_at)
    private LocalDateTime postCreatedAt;
}

package com.helloworld.domain.post.mapper;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 피드 태그 배치 조회용 투영(projection) 행. post_tags→tags 조인 결과 한 줄(post_id + tag_name).
 *
 * <p>여러 게시물의 태그를 한 번의 IN 쿼리로 조회한 뒤, Service가 post_id로 그룹핑해
 * 각 {@code FeedItemResponse.techStacks}에 채운다(글마다 조회하는 N+1 방지).
 * map-underscore-to-camel-case로 post_id→postId, tag_name→tagName 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class PostTagRow {

    private Long postId;
    private String tagName;
}

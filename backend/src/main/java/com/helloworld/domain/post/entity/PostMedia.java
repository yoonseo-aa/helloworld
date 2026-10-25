package com.helloworld.domain.post.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * post_medias 테이블 매핑 객체.
 * 카드뉴스 이미지 목록(image_urls)을 순번(display_order)과 함께 저장한다.
 */
@Getter
@Setter
@NoArgsConstructor
public class PostMedia {

    private Long mediaId;
    private Long postId;
    private String mediaType;     // IMAGE, VIDEO, CODE_SNIPPET
    private String mediaUrl;      // S3/MinIO 주소 또는 코드 원문
    private Integer displayOrder;

    @Builder
    public PostMedia(Long postId, String mediaType, String mediaUrl, Integer displayOrder) {
        this.postId = postId;
        this.mediaType = mediaType;
        this.mediaUrl = mediaUrl;
        this.displayOrder = displayOrder;
    }
}

package com.helloworld.domain.tag.dto.response;

import com.helloworld.domain.tag.entity.Tag;
import lombok.Builder;
import lombok.Getter;

/**
 * 태그 응답 DTO (셀렉트 박스 등에서 사용). JSON은 snake_case로 나감 (tag_id, tag_type, tag_name).
 */
@Getter
@Builder
public class TagResponse {

    private Long tagId;
    private String tagType;
    private String tagName;

    public static TagResponse from(Tag tag) {
        return TagResponse.builder()
                .tagId(tag.getTagId())
                .tagType(tag.getTagType())
                .tagName(tag.getTagName())
                .build();
    }
}

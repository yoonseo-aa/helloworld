package com.helloworld.domain.tag.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * tags 테이블 매핑 객체 (기술/포지션/도메인 태그 마스터).
 * 여러 도메인(post의 post_tags, user의 user_interests)이 공유하는 마스터 테이블.
 */
@Getter
@Setter
@NoArgsConstructor
public class Tag {

    private Long tagId;
    private String tagType;   // TECH, POSITION, DOMAIN
    private String tagName;
}

package com.helloworld.domain.tag.service;

import com.helloworld.domain.tag.dto.response.TagResponse;
import com.helloworld.domain.tag.mapper.TagMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 태그 조회 비즈니스 로직. 프로필/게시물 셀렉트 박스에서 사용할 태그 목록을 제공한다.
 */
@Service
@RequiredArgsConstructor
public class TagService {

    private final TagMapper tagMapper;

    /** 태그 목록 조회 (type: TECH/POSITION/DOMAIN, null이면 전체) */
    @Transactional(readOnly = true)
    public List<TagResponse> getTags(String type) {
        return tagMapper.selectTags(type).stream()
                .map(TagResponse::from)
                .toList();
    }
}

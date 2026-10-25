package com.helloworld.domain.tag.controller;

import com.helloworld.domain.tag.dto.response.TagResponse;
import com.helloworld.domain.tag.service.TagService;
import com.helloworld.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 태그 API. 프로필/게시물 작성 시 셀렉트 박스를 채울 태그 목록을 제공한다.
 */
@RestController
@RequestMapping("/api/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    /** 태그 목록 조회. ?type=TECH|POSITION|DOMAIN (생략 시 전체) */
    @GetMapping
    public ResponseEntity<ApiResponse<List<TagResponse>>> getTags(
            @RequestParam(name = "type", required = false) String type) {
        return ResponseEntity.ok(ApiResponse.success(tagService.getTags(type)));
    }
}

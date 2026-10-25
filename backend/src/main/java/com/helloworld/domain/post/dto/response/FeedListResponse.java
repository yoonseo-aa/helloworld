package com.helloworld.domain.post.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 메인 피드 무한 스크롤 조회 응답.
 * JSON: { "feeds": [...], "page_info": { "next_cursor": ..., "has_next": ... } }
 */
@Getter
@Builder
public class FeedListResponse {

    private final List<FeedItemResponse> feeds;
    private final PageInfoResponse pageInfo;

    public static FeedListResponse of(List<FeedItemResponse> feeds, PageInfoResponse pageInfo) {
        return FeedListResponse.builder()
                .feeds(feeds)
                .pageInfo(pageInfo)
                .build();
    }
}

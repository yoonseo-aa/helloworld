package com.helloworld.domain.follow.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 팔로잉/팔로워 목록 조회 응답 (ZSET 커서 페이징).
 * JSON: { "content": [...], "next_cursor": 1722153600000, "has_next": true }
 * next_cursor = 마지막 항목의 팔로우 시각(epoch ms). 다음 페이지가 없으면 null.
 */
@Getter
@Builder
public class FollowListResponse {

    private final List<FollowUserResponse> content;
    private final Long nextCursor;
    private final Boolean hasNext;

    public static FollowListResponse of(List<FollowUserResponse> content, Long nextCursor, boolean hasNext) {
        return FollowListResponse.builder()
                .content(content)
                .nextCursor(nextCursor)
                .hasNext(hasNext)
                .build();
    }
}

package com.helloworld.domain.search.dto.response;

import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import lombok.Getter;

import java.util.List;

/**
 * 통합(ALL) 검색 응답. 범주별 상위 N건만 미리보기로 담는다.
 * 각 범주 "더 보기"는 해당 type으로 단일 검색을 재호출(커서 페이징).
 * JSON: { "users": [...], "posts": [...], "tech_stack_posts": [...] }
 */
@Getter
public class SearchAllResponse {

    private final List<UserSummaryResponse> users;
    private final List<PostSearchResponse> posts;
    private final List<PostSearchResponse> techStackPosts;

    private SearchAllResponse(List<UserSummaryResponse> users,
                              List<PostSearchResponse> posts,
                              List<PostSearchResponse> techStackPosts) {
        this.users = users;
        this.posts = posts;
        this.techStackPosts = techStackPosts;
    }

    public static SearchAllResponse of(List<UserSummaryResponse> users,
                                       List<PostSearchResponse> posts,
                                       List<PostSearchResponse> techStackPosts) {
        return new SearchAllResponse(users, posts, techStackPosts);
    }
}

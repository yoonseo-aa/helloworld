package com.helloworld.domain.search.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 최근 검색어 1건 (GET /api/search/recent).
 *
 * <p>{@code search_histories} 행을 그대로 매핑한다.
 * map-underscore-to-camel-case로 search_id→searchId, search_type→searchType, searched_at→searchedAt 매핑.
 */
@Getter
@Setter
@NoArgsConstructor
public class RecentSearchResponse {

    private Long searchId;
    private String keyword;
    private String searchType;       // ALL / USER / POST / TECH_STACK
    private LocalDateTime searchedAt;
}

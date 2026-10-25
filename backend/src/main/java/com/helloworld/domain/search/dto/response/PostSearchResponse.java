package com.helloworld.domain.search.dto.response;

import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 검색 결과의 게시물 1건 (POST·TECH_STACK 공용).
 *
 * <p>posts 테이블엔 title이 없어 {@code content_preview}(content 앞부분)를 제목/요약 대용으로 내려준다.
 * author는 users 조인 결과를 UserSummaryResponse로 중첩 매핑한다.
 *
 * <p>{@code matchedStacks}는 <b>기술스택 검색(TECH_STACK)에서만</b> 채운다 — 검색어와 매칭된 TECH 태그명 목록.
 * 본문 검색(POST)에서는 null이며 전역 non_null 설정으로 JSON에서 생략된다.
 */
@Getter
@Setter
@NoArgsConstructor
public class PostSearchResponse {

    private Long postId;
    private String postType;          // PROJECT / CARD_NEWS
    private String thumbnailUrl;
    private String contentPreview;    // content 앞부분(마크다운 원문 일부일 수 있음)
    private UserSummaryResponse author;
    private LocalDateTime createdAt;
    private List<String> matchedStacks;   // 기술스택 검색에서만 채움(검색어와 매칭된 태그명), POST는 null → 생략
}

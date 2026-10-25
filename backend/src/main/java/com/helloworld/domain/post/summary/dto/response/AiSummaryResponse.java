package com.helloworld.domain.post.summary.dto.response;

import lombok.Builder;
import lombok.Getter;

/**
 * AI 요약 생성 응답 (POST /api/posts/{post_id}/ai-summary).
 *
 * <p>이미 올라간 게시물에 요약을 붙일 때 쓴다. 작성 폼에서 저장소를 고르는 경로
 * ({@code /api/posts/analyze})와 달리, 여기서는 생성한 요약을 <b>바로 게시물에 저장</b>한다.
 * 게시물이 이미 존재하므로 캐시에 들고 있을 이유가 없다.
 *
 * <p>필드가 문자열 하나인 것은 프론트 계약을 그대로 따르기 때문이다
 * ({@code AiSummaryResponse { summary: string }}). 값은 마크다운이고, 화면은 그대로 렌더한다.
 */
@Getter
@Builder
public class AiSummaryResponse {

    /**
     * 마크다운 요약. 요약을 만들지 못했으면 <b>빈 문자열</b>이다.
     *
     * <p>null을 주지 않는 이유: 전역 {@code non_null} 직렬화라 null이면 키 자체가 빠지고,
     * 프론트가 {@code data.summary}를 그대로 상태에 넣기 때문에 {@code undefined}가 들어간다.
     */
    private String summary;
}

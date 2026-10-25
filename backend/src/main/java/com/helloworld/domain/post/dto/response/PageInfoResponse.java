package com.helloworld.domain.post.dto.response;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 커서 페이지네이션 정보. JSON: { "next_cursor": "eyJ...", "has_next": true }
 *
 * <p>next_cursor는 다음 요청 cursor로 그대로 보낼 <b>불투명 base64 토큰</b>이다(FeedCursor.encode).
 * 정렬 키 (is_pinned, created_at, post_id)를 담고 있으며, 클라이언트는 해석하지 않고 echo만 한다.
 * 다음 페이지가 없으면 null.
 */
@Getter
@RequiredArgsConstructor(staticName = "of")
public class PageInfoResponse {

    private final String nextCursor;
    private final Boolean hasNext;
}

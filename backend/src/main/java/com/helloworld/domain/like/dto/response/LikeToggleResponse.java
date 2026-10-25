package com.helloworld.domain.like.dto.response;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 좋아요 토글 결과. 값은 Redis(정본)에서 즉시 계산한 값을 그대로 내려준다.
 * 필드명은 공통 규약: is_liked / like_count. 게시물/댓글 좋아요 양쪽에서 공용으로 쓴다.
 *
 * [주의] isLiked를 primitive boolean이 아니라 Boolean(래퍼)으로 둔다.
 *  - Lombok은 boolean 필드는 getIsLiked()가 아니라 isLiked()를 생성해 Jackson이 "liked"로 직렬화해버린다.
 *  - Boolean(래퍼) 필드로 두면 getIsLiked()가 생성되어 snake_case 변환 시 정확히 "is_liked"가 된다.
 */
@Getter
@RequiredArgsConstructor(staticName = "of")
public class LikeToggleResponse {

    private final Boolean isLiked;
    private final Long likeCount;
}

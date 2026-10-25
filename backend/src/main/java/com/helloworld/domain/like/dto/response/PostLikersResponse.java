package com.helloworld.domain.like.dto.response;

import com.helloworld.domain.user.dto.response.UserSummaryResponse;
import com.helloworld.global.common.CursorResponse;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * GET /api/posts/{post_id}/likes 응답.
 * frontend/src/features/feed/types.ts 의 PostLikesResponse({ users, next_cursor, has_next })
 * 계약과 1:1 대응 — 배열 필드명이 반드시 "users"여야 한다 (범용 CursorResponse의 "items"가 아님).
 * 내부 페이지네이션 계산(CursorResponse&lt;PostLikerResponse&gt;)은 그대로 두고, 이 클래스에서
 * 응답 전용 모양으로만 다시 감싼다.
 */
@Getter
@Builder
public class PostLikersResponse {

    private List<UserSummaryResponse> users;
    private Long nextCursor;
    private boolean hasNext;

    public static PostLikersResponse from(CursorResponse<PostLikerResponse> cursorResponse) {
        List<UserSummaryResponse> users = cursorResponse.getItems().stream()
                .map(liker -> UserSummaryResponse.of(
                        liker.getUserId(), liker.getNickname(), liker.getProfileImageUrl()))
                .toList();
        return PostLikersResponse.builder()
                .users(users)
                .nextCursor(cursorResponse.getNextCursor())
                .hasNext(cursorResponse.isHasNext())
                .build();
    }
}

package com.helloworld.domain.chat.dto.response;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

/**
 * 메시지 목록 응답.
 *
 * messages는 항상 <b>오래된 것 → 최신</b> 순서다.
 * 조회 방향(before/after)에 따라 SQL 정렬이 달라지지만, 응답 순서를 하나로 고정해야
 * 프론트가 방향마다 뒤집는 처리를 하지 않는다.
 *
 * 페이지 번호(offset) 대신 커서를 쓰는 이유: 채팅은 조회 중에도 새 메시지가 계속 쌓인다.
 * offset은 그 사이 데이터가 밀려서 같은 메시지를 두 번 보거나 건너뛴다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatMessageListResponse {

    private List<ChatMessageResponse> messages;
    private PageInfo pageInfo;

    public static ChatMessageListResponse of(List<ChatMessageResponse> messages,
                                             boolean hasPrevious, boolean hasNext) {
        Long oldest = messages.isEmpty() ? null : messages.get(0).getMessageId();
        Long newest = messages.isEmpty() ? null : messages.get(messages.size() - 1).getMessageId();
        return new ChatMessageListResponse(messages,
                new PageInfo(hasPrevious, hasNext, oldest, newest));
    }

    @Getter
    @AllArgsConstructor(access = AccessLevel.PRIVATE)
    public static class PageInfo {

        /** 더 오래된 메시지가 있는지. 위로 스크롤을 계속할 수 있는지 판단용 */
        private boolean hasPrevious;

        /** 더 새로운 메시지가 있는지. 갭 복구를 한 번 더 해야 하는지 판단용 */
        private boolean hasNext;

        /** 이 응답에서 가장 오래된 message_id. 다음 before 커서로 그대로 쓴다 */
        private Long oldestMessageId;

        /** 이 응답에서 가장 최신 message_id. 다음 after 커서로 그대로 쓴다 */
        private Long newestMessageId;
    }
}

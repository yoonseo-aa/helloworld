package com.helloworld.domain.chat.dto.response;

import com.helloworld.domain.chat.entity.ChatRoomCounterpart;
import com.helloworld.domain.chat.entity.ChatRoomSummary;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 대화 목록 한 행.
 *
 * 1:1 방은 상대가 1명이라 프론트가 그 사람의 닉네임·사진을 방 제목처럼 쓴다.
 * 그룹 방은 title과 참여자 목록을 함께 내린다.
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChatRoomSummaryResponse {

    private Long roomId;
    private String roomType;

    /** 그룹방 이름. DIRECT는 null이며 프론트가 상대 닉네임을 대신 쓴다 */
    private String title;

    /** 나를 제외한 참여자. DIRECT는 1명 */
    private List<Counterpart> counterparts;

    private LastMessage lastMessage;
    private int unreadCount;
    private Long lastReadMessageId;

    public static ChatRoomSummaryResponse of(ChatRoomSummary summary,
                                             List<ChatRoomCounterpart> counterparts,
                                             String deletedPlaceholder) {
        List<Counterpart> people = counterparts.stream()
                .map(c -> new Counterpart(c.getUserId(), c.getNickname(),
                        c.getProfileImageUrl(), c.getLastReadMessageId()))
                .toList();

        LastMessage last = null;
        if (summary.hasMessage()) {
            last = new LastMessage(
                    summary.getLastMessageId(),
                    summary.getLastSenderId(),
                    // 삭제된 메시지는 목록에서도 원문을 노출하지 않는다.
                    // 상세 조회만 가리고 목록은 그대로 두는 실수가 흔하다.
                    summary.isLastMessageDeleted() ? deletedPlaceholder : summary.getLastContent(),
                    summary.isLastMessageDeleted(),
                    summary.getLastSentAt());
        }

        return new ChatRoomSummaryResponse(
                summary.getRoomId(), summary.getRoomType(), summary.getTitle(),
                people, last, summary.getUnreadCount(), summary.getLastReadMessageId());
    }

    @Getter
    @AllArgsConstructor(access = AccessLevel.PRIVATE)
    public static class Counterpart {
        private Long userId;
        private String nickname;
        private String profileImageUrl;

        /**
         * 이 사람이 어디까지 읽었는지. 목록에서 "내 마지막 메시지를 상대가 읽었나"를
         * 판단하는 데 쓴다(`last_read_message_id >= last_message.message_id`면 읽음).
         *
         * <p>아직 아무 메시지도 읽지 않았으면 <b>null이라 응답에서 아예 빠진다</b>
         * (전역 설정 default-property-inclusion: non_null). 프론트는 "필드가 없음 = 안 읽음"으로 다뤄야 한다.
         *
         * <p>남의 읽음 위치를 내려주는 것은 이미 하고 있는 일이다 —
         * 읽음 이벤트(/topic/chat/rooms/{roomId}/read)가 같은 값을 실시간으로 보낸다.
         * 이 필드는 목록 진입 시점의 초기값을 채워, 이벤트를 받기 전에도 읽음 표시가 맞게 보이도록 한다.
         */
        private Long lastReadMessageId;
    }

    /** 메시지가 아직 없는 방은 이 값이 null이다 */
    @Getter
    @AllArgsConstructor(access = AccessLevel.PRIVATE)
    public static class LastMessage {
        private Long messageId;
        private Long senderId;
        private String content;
        private Boolean isDeleted;
        private LocalDateTime sentAt;
    }
}

package com.helloworld.domain.chat.service;

import com.helloworld.domain.chat.dto.request.ChatMessageSendRequest;
import com.helloworld.domain.chat.dto.response.ChatMessageListResponse;
import com.helloworld.domain.chat.dto.response.ChatMessageResponse;
import com.helloworld.domain.chat.entity.ChatRoomMemberUnread;
import com.helloworld.domain.chat.entity.DmMessage;
import com.helloworld.domain.chat.mapper.ChatMessageMapper;
import com.helloworld.domain.chat.mapper.ChatRoomMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 메시지 전송·조회 비즈니스 로직.
 *
 * 참여자 검증은 {@link ChatRoomService#validateParticipant}에 위임한다.
 * room_id는 클라이언트가 보내는 값이라 조회든 전송이든 매번 확인해야 한다.
 */
@Service
@RequiredArgsConstructor
public class ChatMessageService {

    private static final String MESSAGE_TYPE_TEXT = "TEXT";

    private static final int DEFAULT_SIZE = 50;
    private static final int MAX_SIZE = 100;

    /** 삭제된 메시지 자리에 보여줄 문구. 응답 DTO와 삭제 이벤트가 같은 값을 써야 표시가 어긋나지 않는다. */
    public static final String DELETED_PLACEHOLDER = "삭제된 메시지입니다.";

    private final ChatMessageMapper chatMessageMapper;
    private final ChatRoomMapper chatRoomMapper;
    private final ChatRoomService chatRoomService;

    /**
     * 전송 결과. {@code created}가 false면 중복 전송이라 새로 저장하지 않았다는 뜻이다.
     * 컨트롤러가 이 값을 보고 브로드캐스트 여부를 결정한다 — 재시도까지 다시 뿌리면
     * 방 사람들에게 같은 메시지가 두 번 보인다.
     *
     * {@code memberUnreads}는 개인 큐 갱신용으로, 새로 저장된 경우에만 채워진다
     * (중복 전송이면 안읽음 수가 달라지지 않으므로 알릴 것이 없다).
     */
    public record SendResult(ChatMessageResponse message, boolean created,
                             List<ChatRoomMemberUnread> memberUnreads) {
    }

    @Transactional
    public SendResult send(Long roomId, Long senderId, ChatMessageSendRequest request) {
        chatRoomService.validateParticipant(roomId, senderId);

        String clientMessageId = StringUtils.hasText(request.getClientMessageId())
                ? request.getClientMessageId()
                : null;

        DmMessage message = DmMessage.builder()
                .roomId(roomId)
                .senderId(senderId)
                .messageType(MESSAGE_TYPE_TEXT)
                .content(request.getContent())
                .clientMessageId(clientMessageId)
                .build();

        try {
            chatMessageMapper.insertMessage(message);   // message_id가 채워진다
        } catch (DuplicateKeyException e) {
            // 같은 client_message_id로 이미 저장된 메시지가 있다(재시도·중복 클릭).
            // 여기서 일반 SELECT를 쓰면 안 된다 — REPEATABLE READ 스냅샷 때문에
            // 동시 요청이 방금 커밋한 행이 보이지 않아 null이 나온다. FOR SHARE로 최신 커밋을 읽는다.
            DmMessage existing = chatMessageMapper.selectByClientMessageIdForShare(
                    roomId, senderId, clientMessageId);
            if (existing == null) {
                throw e;   // client_message_id 외의 다른 중복이면 감추지 않고 올린다
            }
            return new SendResult(ChatMessageResponse.from(existing), false, List.of());
        }

        // 참여자별 안읽음 수를 같은 트랜잭션 안에서 읽는다. 방금 넣은 메시지는 자기 트랜잭션에서
        // 보이므로 이번 메시지까지 포함된 값이 나온다.
        //
        // 다른 사람이 거의 동시에 보낸 메시지는 이 스냅샷에 안 잡힐 수 있는데,
        // STOMP 인바운드 채널이 단일 스레드라(WebSocketConfig) 같은 순간에 두 전송 트랜잭션이
        // 겹치지 않아 실제로는 발생하지 않는다. 나중에 그 스레드 수를 늘린다면
        // 이 값이 낮게 나온 이벤트가 늦게 도착해 뱃지가 어긋날 수 있으니 함께 검토해야 한다.
        List<ChatRoomMemberUnread> memberUnreads = chatRoomMapper.selectMemberUnreadCounts(roomId);

        // insert에는 created_at을 NOW()로 넣었을 뿐이라 객체에는 값이 없다.
        // 응답 시각을 DB와 맞추려면 다시 읽어야 하지만, 왕복을 늘리지 않기 위해
        // 방금 만든 값을 그대로 쓰고 시각은 조회 시점에 DB 값이 내려간다(아래 주석 참고).
        return new SendResult(ChatMessageResponse.from(
                reload(roomId, senderId, clientMessageId, message)), true, memberUnreads);
    }

    /**
     * 저장 직후 값을 채워 돌려준다.
     *
     * created_at을 DB의 NOW()로 넣기 때문에 자바 쪽 객체에는 시각이 비어 있다.
     * client_message_id가 있으면 그것으로 다시 읽어 정확한 시각을 채우고,
     * 없으면(중복 방지를 포기한 클라이언트) 재조회 키가 없으므로 시각 없이 내려간다.
     * 이 경우 프론트는 수신 시각을 쓰면 된다.
     */
    private DmMessage reload(Long roomId, Long senderId, String clientMessageId, DmMessage fallback) {
        if (clientMessageId == null) {
            return fallback;
        }
        DmMessage saved = chatMessageMapper.selectByClientMessageIdForShare(
                roomId, senderId, clientMessageId);
        return saved != null ? saved : fallback;
    }

    /**
     * 메시지 목록 조회. 초기 로드 · 위로 스크롤 · 갭 복구를 한 엔드포인트에서 처리한다.
     *
     * - 커서 없음: 최신 size건 (채팅방 진입)
     * - before: 그 id보다 오래된 size건 (위로 스크롤)
     * - after: 그 id보다 새로운 size건 (재연결 후 놓친 메시지 복구)
     *
     * 둘 다 오면 after를 우선한다. 갭 복구가 더 급한 요청이고,
     * 두 조건을 동시에 만족시키면 범위가 좁아져 클라이언트가 의도한 결과와 달라진다.
     */
    @Transactional(readOnly = true)
    public ChatMessageListResponse getMessages(Long roomId, Long userId,
                                               Long before, Long after, Integer size) {
        chatRoomService.validateParticipant(roomId, userId);

        int limit = normalizeSize(size);

        List<DmMessage> found;
        if (after != null) {
            found = chatMessageMapper.selectAfter(roomId, after, limit);   // 이미 오름차순
        } else if (before != null) {
            found = reverse(chatMessageMapper.selectBefore(roomId, before, limit));
        } else {
            found = reverse(chatMessageMapper.selectLatest(roomId, limit));
        }

        if (found.isEmpty()) {
            // 커서 기준으로 더 있는지는 여전히 알려줘야 한다.
            // 예: 갭 복구에서 새 메시지가 없으면 빈 목록 + has_next=false 로 "따라잡았다"를 표현한다.
            return ChatMessageListResponse.of(List.of(), false, false);
        }

        Long oldest = found.get(0).getMessageId();
        Long newest = found.get(found.size() - 1).getMessageId();

        boolean hasPrevious = chatMessageMapper.existsOlderThan(roomId, oldest);
        boolean hasNext = chatMessageMapper.existsNewerThan(roomId, newest);

        List<ChatMessageResponse> messages = found.stream()
                .map(ChatMessageResponse::from)
                .toList();

        return ChatMessageListResponse.of(messages, hasPrevious, hasNext);
    }

    /**
     * 읽음 처리. "이 메시지까지 읽었다"를 기록한다.
     *
     * @return 실제로 읽음 위치가 앞으로 갔으면 true. 이미 그 지점 이상을 읽었으면 false.
     *         false면 이벤트를 뿌리지 않는다 — 화면을 열어둔 채 스크롤만 해도
     *         읽음 이벤트가 계속 날아가면 상대 화면이 불필요하게 갱신된다.
     */
    @Transactional
    public boolean markAsRead(Long roomId, Long userId, Long lastReadMessageId) {
        chatRoomService.validateParticipant(roomId, userId);

        // 다른 방의 message_id를 넣어 읽음 위치를 엉뚱하게 옮기는 것을 막는다.
        DmMessage target = chatMessageMapper.selectInRoom(roomId, lastReadMessageId);
        if (target == null) {
            throw new BusinessException(ErrorCode.CHAT_MESSAGE_NOT_FOUND);
        }

        return chatRoomMapper.updateLastReadMessageId(roomId, userId, lastReadMessageId) > 0;
    }

    /**
     * 메시지 삭제 (soft delete). 본인이 보낸 것만 지울 수 있다.
     *
     * hard delete를 쓰지 않는 이유: 대화 흐름에서 메시지가 통째로 사라지면 앞뒤 문맥이 끊기고,
     * 커서(message_id) 기준 조회에서 빈 구멍이 생긴다.
     *
     * @return 방금 삭제했으면 true. 이미 삭제된 상태였으면 false(이벤트를 다시 뿌리지 않는다)
     */
    @Transactional
    public boolean delete(Long roomId, Long userId, Long messageId) {
        chatRoomService.validateParticipant(roomId, userId);

        DmMessage target = chatMessageMapper.selectInRoom(roomId, messageId);
        if (target == null) {
            throw new BusinessException(ErrorCode.CHAT_MESSAGE_NOT_FOUND);
        }
        if (!target.getSenderId().equals(userId)) {
            throw new BusinessException(ErrorCode.CHAT_CANNOT_DELETE_OTHERS);
        }

        return chatMessageMapper.softDelete(messageId) > 0;
    }

    /** size 보정. 상한을 두지 않으면 한 번에 수만 건을 요청해 서버를 밀어버릴 수 있다. */
    private int normalizeSize(Integer size) {
        if (size == null || size <= 0) {
            return DEFAULT_SIZE;
        }
        return Math.min(size, MAX_SIZE);
    }

    /** DESC로 읽은 결과를 오래된 순으로 뒤집는다(응답 순서를 하나로 고정하기 위해). */
    private List<DmMessage> reverse(List<DmMessage> messages) {
        List<DmMessage> copy = new ArrayList<>(messages);
        Collections.reverse(copy);
        return copy;
    }
}

package com.helloworld.domain.chat.controller;

import com.helloworld.domain.chat.dto.response.ChatMessageDeletedEvent;
import com.helloworld.domain.chat.dto.response.ChatMessageListResponse;
import com.helloworld.domain.chat.service.ChatMessageService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채팅 메시지 조회 API (REST).
 *
 * 전송은 WebSocket(STOMP)으로 하고 조회는 REST로 한다.
 * 과거 메시지 조회는 실시간성이 필요 없고, 브라우저 캐시·재시도·에러 처리를
 * HTTP 표준에 맡기는 편이 단순하다.
 */
@RestController
@RequestMapping("/api/chat/rooms")
@RequiredArgsConstructor
public class ChatMessageController {

    private final ChatMessageService chatMessageService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 메시지 목록 조회. 세 가지 상황을 한 엔드포인트로 처리한다.
     *
     * <pre>
     * 채팅방 진입      GET .../messages
     * 위로 스크롤      GET .../messages?before={oldest_message_id}
     * 재연결 갭 복구   GET .../messages?after={newest_message_id}
     * </pre>
     *
     * 응답의 messages는 항상 오래된 것 → 최신 순서다.
     * 다음 커서로 쓸 값은 page_info의 oldest_message_id / newest_message_id를 그대로 넣으면 된다.
     */
    @GetMapping("/{roomId}/messages")
    public ResponseEntity<ApiResponse<ChatMessageListResponse>> getMessages(
            @LoginUserId Long userId,
            @PathVariable Long roomId,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) Integer size) {
        ChatMessageListResponse data =
                chatMessageService.getMessages(roomId, userId, before, after, size);
        return ResponseEntity.ok(ApiResponse.success("메시지를 조회했습니다.", data));
    }

    /**
     * 메시지 삭제 (soft delete). 본인이 보낸 것만 지울 수 있다.
     *
     * REST로 두는 이유: 삭제는 실시간성이 필요한 동작이 아니고, 실패했을 때
     * 사용자에게 이유를 알려줘야 한다(남의 메시지·이미 삭제됨). STOMP는 ERROR 프레임으로
     * 연결이 끊기므로 그런 안내에 적합하지 않다.
     *
     * 다만 <b>결과는 실시간으로 알려야 한다</b> — 상대 화면에 이미 그려진 메시지를 바꿔야 하므로
     * 방 topic으로 삭제 이벤트를 브로드캐스트한다.
     */
    @DeleteMapping("/{roomId}/messages/{messageId}")
    public ResponseEntity<ApiResponse<Void>> deleteMessage(
            @LoginUserId Long userId,
            @PathVariable Long roomId,
            @PathVariable Long messageId) {
        boolean deleted = chatMessageService.delete(roomId, userId, messageId);

        if (deleted) {
            messagingTemplate.convertAndSend(
                    "/topic/chat/rooms/" + roomId + "/deleted",
                    ChatMessageDeletedEvent.of(roomId, messageId,
                            ChatMessageService.DELETED_PLACEHOLDER));
        }
        // 이미 삭제된 상태였으면 이벤트를 다시 뿌리지 않는다(멱등). 응답은 성공으로 준다 —
        // 결과 상태가 요청과 같으므로 오류로 볼 이유가 없다.

        return ResponseEntity.ok(ApiResponse.success("메시지를 삭제했습니다.", null));
    }
}

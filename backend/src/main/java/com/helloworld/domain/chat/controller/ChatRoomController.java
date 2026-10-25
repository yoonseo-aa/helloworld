package com.helloworld.domain.chat.controller;

import com.helloworld.domain.chat.dto.request.ChatRoomCreateRequest;
import com.helloworld.domain.chat.dto.response.ChatRoomCreateResponse;
import com.helloworld.domain.chat.dto.response.ChatRoomListResponse;
import com.helloworld.domain.chat.dto.response.UnreadCountResponse;
import com.helloworld.domain.chat.service.ChatRoomService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 채팅방 API. HTTP 요청/응답만 담당한다.
 * - 현재 로그인 사용자(@LoginUserId)를 개설자·참여자로 넣는다.
 */
@RestController
@RequestMapping("/api/chat/rooms")   // 리소스 복수형, /api/ 접두어(버전 없음)
@RequiredArgsConstructor
public class ChatRoomController {

    private final ChatRoomService chatRoomService;

    /**
     * 채팅방 생성/재사용.
     * 같은 상대와 이미 대화한 이력이 있으면 기존 방을 돌려준다(is_new=false).
     * 200을 쓰는 이유: 새로 만들어질 수도, 기존 것을 돌려줄 수도 있어 201로 단정할 수 없다.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<ChatRoomCreateResponse>> createOrGetRoom(
            @LoginUserId Long userId,
            @Valid @RequestBody ChatRoomCreateRequest request) {
        ChatRoomCreateResponse data = chatRoomService.createOrGetRoom(userId, request);
        return ResponseEntity.ok(ApiResponse.success("채팅방이 준비되었습니다.", data));
    }

    /**
     * 대화 목록 조회. 1:1·단체방을 구분하지 않고 최신 대화가 먼저 온다.
     *
     * keyword를 주면 <b>참여자 이름으로 검색</b>한다.
     * "손정민"을 검색하면 그 사람과의 1:1 방뿐 아니라 그 사람이 함께 있는 단체방도 나온다.
     *
     * 무한 스크롤은 page_info의 두 커서 값을 다음 요청에 그대로 넣으면 된다.
     * 정렬 키가 (마지막 메시지 id, room_id)라서 커서도 두 값이 필요하다 —
     * 마지막 메시지 id만으로는 값이 같은 방들에서 경계가 모호해 누락·중복이 생긴다.
     *
     * <p><b>쿼리 파라미터 이름을 snake_case로 명시하는 이유</b>:
     * 전역 SNAKE_CASE 설정은 <b>JSON 본문 직렬화에만</b> 적용되고 쿼리 파라미터에는 적용되지 않는다.
     * 이름을 지정하지 않으면 파라미터가 자바 필드명 그대로 {@code beforeLastMessageId}가 되어,
     * 응답(`next_cursor_last_message_id`)을 받은 프론트가 자연스럽게 되돌려 보내는
     * {@code before_last_message_id}는 <b>조용히 무시된다</b>. 오류도 안 나고 커서 없는
     * 첫 페이지가 돌아와 무한 스크롤이 1페이지를 무한 반복한다.
     * 응답이 snake_case면 요청도 snake_case여야 한다.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<ChatRoomListResponse>> getRooms(
            @LoginUserId Long userId,
            @RequestParam(required = false) String keyword,
            @RequestParam(name = "before_last_message_id", required = false) Long beforeLastMessageId,
            @RequestParam(name = "before_room_id", required = false) Long beforeRoomId,
            @RequestParam(required = false) Integer size) {
        ChatRoomListResponse data =
                chatRoomService.getRooms(userId, keyword, beforeLastMessageId, beforeRoomId, size);
        return ResponseEntity.ok(ApiResponse.success("대화 목록을 조회했습니다.", data));
    }

    /** 전체 안읽음 수. 헤더·탭 뱃지용. 방별 수치는 대화 목록 응답에 이미 들어 있다. */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<UnreadCountResponse>> getUnreadCount(
            @LoginUserId Long userId) {
        return ResponseEntity.ok(
                ApiResponse.success("안읽은 메시지 수를 조회했습니다.",
                        chatRoomService.getTotalUnreadCount(userId)));
    }
}

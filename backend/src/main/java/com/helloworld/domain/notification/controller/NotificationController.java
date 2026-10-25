package com.helloworld.domain.notification.controller;

import com.helloworld.domain.notification.dto.request.NotificationUpdateRequest;
import com.helloworld.domain.notification.dto.response.NotificationResponse;
import com.helloworld.domain.notification.dto.response.UnreadNotificationCountResponse;
import com.helloworld.domain.notification.service.NotificationService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.common.CursorResponse;
import com.helloworld.global.security.LoginUserId;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 알림 API.
 *
 * <p>화면은 한 페이지이고 버튼이 두 개다 — "전체"와 "읽지 않음". 두 목록이 정렬·형태가 같고
 * 필터 조건만 다르므로 <b>엔드포인트를 두 개로 나누지 않고 {@code unread_only} 파라미터로 받는다.</b>
 * 나누면 같은 쿼리를 두 벌 유지해야 하고, 나중에 정렬이나 필드가 바뀔 때 한쪽만 고치는 실수가 생긴다.
 */
@Tag(name = "알림", description = "알림 조회·읽음 처리 API")
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /**
     * 알림 목록 (최신순, 커서 페이지네이션).
     *
     * <p>커서 파라미터 이름을 {@code cursor}로 둔 이유: 한 단어라 전역 SNAKE_CASE 설정과
     * 무관하게 안전하다. 여러 단어 파라미터는 쿼리 파라미터에 snake_case가 적용되지 않아
     * 이름을 명시해야 하는데(대화 목록에서 겪음), 여기서는 그 문제가 없다.
     */
    @Operation(summary = "알림 목록 조회",
            description = "unread_only=true면 읽지 않은 알림만. 커서는 직전 응답의 next_cursor를 그대로 넣습니다.")
    @GetMapping
    public ResponseEntity<ApiResponse<CursorResponse<NotificationResponse>>> getNotifications(
            @LoginUserId Long userId,
            @RequestParam(name = "unread_only", required = false, defaultValue = "false") boolean unreadOnly,
            @RequestParam(required = false) Long cursor,
            @RequestParam(required = false) Integer size) {
        CursorResponse<NotificationResponse> data =
                notificationService.getNotifications(userId, unreadOnly, cursor, size);
        return ResponseEntity.ok(ApiResponse.success("알림 목록을 조회했습니다.", data));
    }

    /** 안 읽은 알림 수. 헤더·사이드바 뱃지용 (채팅의 unread-count와 같은 역할) */
    @Operation(summary = "안 읽은 알림 수", description = "뱃지 초기값용. 이후 갱신은 개인 큐 push로 받습니다.")
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<UnreadNotificationCountResponse>> getUnreadCount(
            @LoginUserId Long userId) {
        UnreadNotificationCountResponse data =
                UnreadNotificationCountResponse.of(notificationService.getUnreadCount(userId));
        return ResponseEntity.ok(ApiResponse.success("안 읽은 알림 수를 조회했습니다.", data));
    }

    /**
     * 알림 하나를 읽음으로 표시한다.
     *
     * <p><b>URL을 {@code /{id}/read}로 두지 않은 이유</b>: 규약이 URL에 동사를 금지한다.
     * 상태 일부를 바꾸는 것이므로 {@code PATCH}에 바꿀 상태({@code is_read})를 본문으로 받는다.
     * 나중에 "안 읽음으로 되돌리기"가 필요해지면 같은 엔드포인트에서 {@code false}를 받으면 되고,
     * URL을 새로 만들지 않아도 된다.
     *
     * <p>없는 알림·남의 알림·이미 읽은 알림 모두 200이다. 이유는 서비스 쪽에 적었다 —
     * 요약하면 "권한 없음"과 "없음"을 구분해 알려주면 남의 알림 존재 여부를 탐색할 수 있고,
     * 중복 호출은 정상 상황이기 때문이다.
     */
    @Operation(summary = "알림 읽음 처리",
            description = "본문에 is_read=true. 본인 알림만 변경됩니다. 이미 읽었거나 대상이 없어도 200입니다.")
    @PatchMapping("/{notification_id}")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @LoginUserId Long userId,
            @PathVariable("notification_id") Long notificationId,
            @Valid @RequestBody NotificationUpdateRequest request) {
        notificationService.markAsRead(userId, notificationId);
        return ResponseEntity.ok(ApiResponse.success("알림을 읽음으로 처리했습니다.", null));
    }
}

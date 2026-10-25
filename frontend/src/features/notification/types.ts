/**
 * 알림 API 타입 — 백엔드 domain/notification 실응답(2026-08-06 실측) 기준.
 * 응답은 전역 SNAKE_CASE + non_null 직렬화라, 값이 없는 필드는 null이 아니라
 * **키 자체가 빠진다**(그래서 optional).
 */

/** 백엔드 notifications.type. 시안엔 mention·badge·notice도 있지만 서버엔 이 3종뿐이다. */
export type NotificationType = 'FOLLOW' | 'LIKE' | 'COMMENT'

export interface NotificationItem {
  notification_id: number
  type: NotificationType
  is_read: boolean
  /** LIKE·COMMENT만 채워진다(FOLLOW는 대상이 사람이라 없다). */
  target_post_id?: number
  /** COMMENT만 채워진다. 지금 화면은 게시물로만 이동한다. */
  target_comment_id?: number
  created_at: string
  /** 알림을 발생시킨 사람 — 중첩 객체가 아니라 평평하게 온다. */
  actor_id: number
  actor_nickname: string
  actor_profile_image_url?: string | null
}

/** GET /api/notifications — 공용 CursorResponse 모양. next_cursor는 마지막 페이지면 빠진다. */
export interface NotificationListResponse {
  items: NotificationItem[]
  next_cursor?: number
  has_next: boolean
}

export interface UnreadNotificationCountResponse {
  unread_count: number
}

/** 화면 필터 — 서버는 unread_only 파라미터 하나로 받는다(엔드포인트가 나뉘어 있지 않다). */
export type NotificationFilter = 'ALL' | 'UNREAD'

/**
 * 개인 큐(/user/queue/updates) 실시간 payload.
 *
 * 이 큐는 채팅(type=CHAT_MESSAGE)과 같이 쓴다 — 최상단 type으로 갈라서 각 feature가 처리한다.
 * notification은 목록 조회와 **같은 DTO**라 받은 그대로 목록에 끼워 넣을 수 있고,
 * unread_count는 서버가 센 절대값이라 프론트가 누적하지 않는다(유실·중복에 강하다).
 */
export interface NotificationPushEvent {
  type: 'NOTIFICATION'
  notification: NotificationItem
  unread_count: number
}

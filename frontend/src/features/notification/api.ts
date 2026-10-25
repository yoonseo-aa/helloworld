import { apiClient } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  NotificationListResponse,
  UnreadNotificationCountResponse,
} from './types'

/** 알림 목록 — 최신순, notification_id 커서. unread_only로 '읽지 않음' 필터를 같이 처리한다. */
export async function getNotifications(params: {
  unread_only?: boolean
  cursor?: number
  size: number
}) {
  const { data } = await apiClient.get<ApiResponse<NotificationListResponse>>(
    '/api/notifications',
    { params },
  )
  return data.data
}

/** 안 읽은 알림 수 — 화면 상단 요약("읽지 않은 알림 N건")에 쓴다. */
export async function getUnreadNotificationCount() {
  const { data } = await apiClient.get<
    ApiResponse<UnreadNotificationCountResponse>
  >('/api/notifications/unread-count')
  return data.data
}

/**
 * 알림 1건 읽음 처리. URL에 동사를 쓰지 않는 규약이라 PATCH + 본문 {is_read: true}다.
 * 서버는 없는 알림·남의 알림·이미 읽은 알림도 200으로 받아준다(멱등).
 * is_read=false는 서버가 거부한다 — 읽음 해제 기능은 없다.
 */
export async function markNotificationAsRead(notificationId: number) {
  await apiClient.patch<ApiResponse<null>>(
    `/api/notifications/${notificationId}`,
    { is_read: true },
  )
}

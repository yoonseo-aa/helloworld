import NotificationView from '@/features/notification/components/NotificationView'

/**
 * 알림 — /notifications.
 *
 * 좋아요·댓글·팔로우 3종(백엔드 notifications.type이 이 셋뿐이다).
 * 목록·읽음 처리는 REST, 실시간 수신은 개인 큐 push가 담당할 자리다(아직 미연결).
 */
export default function NotificationsPage() {
  return <NotificationView />
}

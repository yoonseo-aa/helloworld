import { create } from 'zustand'

/**
 * DM·알림 안읽음 뱃지 카운트.
 *
 * TanStack Query가 아니라 Zustand인 이유: 서버 리소스를 그대로 캐시하는 게 아니라
 * "개인 큐 push로 증가, 방 입장·읽음 처리 시 로컬 상태 갱신으로 감소"하는 실시간
 * 러닝 카운터라서다(CLAUDE.md "뱃지 동기화" 규칙). REST 조회는 로그인 직후
 * 초기값을 한 번 채우는 용도로만 쓰고(main.tsx), 그 뒤로는 push/로컬 이벤트가 갱신한다.
 *
 * 증가·감소 둘 다 개인 큐(feature/be-chat-personal-queue, develop 머지 완료)로 연결돼
 * 있다(main.tsx의 onPersonalMessage 등록 참고).
 *
 * 알림 카운트도 같은 큐를 쓴다(payload type=NOTIFICATION). 다만 채팅과 달리 **서버가
 * 안 읽은 알림 수 절대값을 같이 실어 보내므로**(NotificationPushEvent.unread_count)
 * 프론트에서 증가분을 누적하지 않고 받은 값을 그대로 넣는다 — push가 유실되거나
 * 중복돼도 뱃지가 어긋나지 않는다. 감소는 읽음 처리(1건·모두)에서 로컬로 반영한다.
 */
interface BadgeState {
  dmUnreadCount: number
  /** 안 읽은 알림 수. push는 절대값으로 덮어쓰고, 읽음 처리 때 로컬로 줄인다. */
  notificationUnreadCount: number
  /**
   * 지금 보고 있는 채팅방 id (채팅방 화면 밖이면 null). useChatRoomLive가 입장/퇴장 때
   * 갱신한다. 이 방의 개인 큐 push는 뱃지에 올리지 않는다 — 보고 있는 방의 새 메시지는
   * 받는 즉시 읽음을 발행하므로, 올렸다가 재동기화로 내리면 뱃지가 깜빡이기만 한다.
   */
  activeDmRoomId: number | null
  setDmUnreadCount: (count: number) => void
  incrementDmUnreadCount: (by?: number) => void
  setActiveDmRoomId: (roomId: number | null) => void
  setNotificationUnreadCount: (count: number) => void
  decreaseNotificationUnreadCount: (by?: number) => void
}

export const useBadgeStore = create<BadgeState>((set) => ({
  dmUnreadCount: 0,
  notificationUnreadCount: 0,
  activeDmRoomId: null,
  setDmUnreadCount: (count) => set({ dmUnreadCount: count }),
  incrementDmUnreadCount: (by = 1) =>
    set((state) => ({ dmUnreadCount: state.dmUnreadCount + by })),
  setActiveDmRoomId: (roomId) => set({ activeDmRoomId: roomId }),
  setNotificationUnreadCount: (count) =>
    set({ notificationUnreadCount: Math.max(0, count) }),
  decreaseNotificationUnreadCount: (by = 1) =>
    set((state) => ({
      notificationUnreadCount: Math.max(0, state.notificationUnreadCount - by),
    })),
}))

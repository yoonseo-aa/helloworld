import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useBadgeStore } from '@/stores/useBadgeStore'
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
} from './api'
import type {
  NotificationFilter,
  NotificationListResponse,
  NotificationPushEvent,
} from './types'

/** 목록 페이지 크기 — 백엔드 기본값(DEFAULT_SIZE=20)과 맞춘다. */
const PAGE_SIZE = 20

const listKey = (filter: NotificationFilter) =>
  ['notifications', 'list', filter] as const

/** 알림 목록 (최신순 무한 스크롤). 필터가 바뀌면 서버에 unread_only로 다시 물어본다. */
export function useNotifications(filter: NotificationFilter) {
  return useInfiniteQuery({
    queryKey: listKey(filter),
    queryFn: ({ pageParam }) =>
      getNotifications({
        unread_only: filter === 'UNREAD',
        cursor: pageParam,
        size: PAGE_SIZE,
      }),
    initialPageParam: undefined as number | undefined,
    // 마지막 페이지면 next_cursor 자체가 응답에서 빠진다 — has_next와 같이 본다.
    getNextPageParam: (last) => (last.has_next ? last.next_cursor : undefined),
  })
}

type ListCache = InfiniteData<NotificationListResponse, number | undefined>

/**
 * 열려 있는 모든 필터의 목록 캐시를 손본다(전체·읽지 않음 두 벌이 있다).
 * 변환 함수는 그 캐시가 어느 필터의 것인지 함께 받는다 — 같은 사건이라도
 * '전체'는 표시만 바꾸고 '읽지 않음'은 목록에서 빼야 하기 때문.
 */
function updateListCaches(
  queryClient: QueryClient,
  update: (
    page: NotificationListResponse,
    filter: NotificationFilter,
  ) => NotificationListResponse,
) {
  const snapshot = queryClient.getQueriesData<ListCache>({
    queryKey: ['notifications', 'list'],
  })
  for (const [key, cache] of snapshot) {
    if (!cache) continue
    const filter = key[2] as NotificationFilter
    queryClient.setQueryData<ListCache>(key, {
      ...cache,
      pages: cache.pages.map((page) => update(page, filter)),
    })
  }
  return snapshot
}

/**
 * 알림 1건 읽음 처리.
 *
 * 누르면 곧바로 대상 화면으로 이동하므로 응답을 기다리면 "안 읽음 표시가 남은 채로
 * 떠나는" 느낌이 된다 — 낙관적으로 먼저 칠하고(onMutate) 결과가 오면 서버 값으로 맞춘다.
 * 서버가 멱등이라(이미 읽음도 200) 중복 호출이 문제되지 않는다.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markNotificationAsRead,
    onMutate: async (notificationId: number) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })

      // 두 필터('전체'·'읽지 않음')가 각각 캐시를 갖는다 — 열려 있는 쪽만 고치면
      // 탭을 옮겼을 때 옛 상태가 그대로 보인다. 있는 캐시를 모두 손본다.
      // '전체'는 읽음 표시만 바꾸고, '읽지 않음'은 목록에서 뺀다 — 그래야 서버에
      // 다시 물어보지 않아도 두 탭이 다 맞는다. 커서 페이징이라 로컬에서 한 건을 빼도
      // 페이지 경계가 어긋나지 않는다(오프셋 페이징인 댓글 목록과 다른 점).
      const snapshot = updateListCaches(queryClient, (page, filter) =>
        filter === 'UNREAD'
          ? {
              ...page,
              items: page.items.filter(
                (item) => item.notification_id !== notificationId,
              ),
            }
          : {
              ...page,
              items: page.items.map((item) =>
                item.notification_id === notificationId
                  ? { ...item, is_read: true }
                  : item,
              ),
            },
      )

      // 레일 뱃지도 같이 내린다(뱃지 감소는 로컬 반영 — CLAUDE.md "뱃지 동기화").
      const prevCount = useBadgeStore.getState().notificationUnreadCount
      useBadgeStore.getState().decreaseNotificationUnreadCount()
      return { snapshot, prevCount }
    },
    onError: (_error, _id, context) => {
      // 실패하면 손댄 캐시·뱃지를 그대로 되돌린다(낙관 반영의 짝).
      for (const [key, cache] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, cache)
      }
      if (context) {
        useBadgeStore.getState().setNotificationUnreadCount(context.prevCount)
      }
    },

  })
}

/*
 * '모두 읽음 표시'는 두지 않는다(시안에는 있다).
 * 서버에 일괄 처리 엔드포인트가 없어서 프론트가 안 읽은 알림을 페이지로 훑어 개별 PATCH를
 * 반복해야 하는데, 버튼 하나에 요청 수백 개가 딸려 나가는 구조를 남기지 않기로 했다.
 * 백엔드에 read-all이 생기면 그때 버튼과 함께 다시 붙인다.
 */

let resyncInFlight = false

/**
 * 알림 뱃지를 서버 값으로 재동기화한다.
 *
 * 로그인 직후·재연결 직후에 부른다. 뱃지는 push로 갱신되는데, 연결이 끊겨 있던 동안의
 * push는 재전송되지 않으므로(개인 큐 특성) 붙을 때마다 스냅샷으로 유실분을 흡수한다.
 * 짧은 시간에 여러 곳이 겹쳐 불러도 요청은 하나로 합친다(DM 뱃지와 같은 방식).
 */
export function resyncNotificationBadge() {
  if (resyncInFlight) return
  resyncInFlight = true
  void getUnreadNotificationCount()
    .then(({ unread_count }) =>
      useBadgeStore.getState().setNotificationUnreadCount(unread_count),
    )
    .catch(() => {
      // 실패해도 옛 값 유지 — 다음 읽음·재연결 때 다시 시도된다.
    })
    .finally(() => {
      resyncInFlight = false
    })
}

/**
 * 개인 큐로 온 새 알림 처리 — main.tsx가 등록한다(컴포넌트 트리 밖, 앱 전역 1회).
 *
 * 뱃지는 서버가 보낸 절대값을 그대로 쓴다. 목록 캐시에는 맨 앞에 끼워 넣어, 알림 화면을
 * 보고 있는 중에 새 알림이 오면 새로고침 없이 위에 쌓이게 한다. 이미 있는 알림이면
 * (재연결 직후 겹치는 경우) 넣지 않는다 — 커서 페이징이라 중복이 화면에 그대로 남는다.
 */
export function handleNotificationPushEvent(
  queryClient: QueryClient,
  payload: unknown,
) {
  const event = payload as NotificationPushEvent
  if (event.type !== 'NOTIFICATION' || !event.notification) return

  useBadgeStore.getState().setNotificationUnreadCount(event.unread_count)

  const caches = queryClient.getQueriesData<ListCache>({
    queryKey: ['notifications', 'list'],
  })
  for (const [key, cache] of caches) {
    if (!cache || cache.pages.length === 0) continue
    const exists = cache.pages.some((page) =>
      page.items.some(
        (item) => item.notification_id === event.notification.notification_id,
      ),
    )
    if (exists) continue
    queryClient.setQueryData<ListCache>(key, {
      ...cache,
      pages: cache.pages.map((page, index) =>
        index === 0
          ? { ...page, items: [event.notification, ...page.items] }
          : page,
      ),
    })
  }
}

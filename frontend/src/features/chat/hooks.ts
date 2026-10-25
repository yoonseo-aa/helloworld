import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  createChatRoom,
  deleteChatMessage,
  getChatMessages,
  getChatRooms,
  getChatUnreadCount,
} from './api'
import type {
  ChatMessage,
  ChatMessageListResponse,
  ChatRoomCounterpart,
  ChatRoomListResponse,
  ChatRoomSummary,
  ChatRoomUpdateEvent,
  PendingChatMessage,
  RoomDeletedEventFrame,
  RoomReadEventFrame,
  RoomTopicMessageFrame,
} from './types'
import { useSubscription } from '@/socket/useSubscription'
import {
  onPersonalErrorMessage,
  publishStomp,
  useStompConnectionStatus,
  type StompErrorPayload,
} from '@/socket/stompClient'
import { useAuthStore } from '@/stores/useAuthStore'
import { useBadgeStore } from '@/stores/useBadgeStore'
import type { QueryClient } from '@tanstack/react-query'

/** 에코가 이 시간 안에 안 오면 실패로 본다. 명세에 정확한 값이 없어 임의로 정했다. */
const SEND_ECHO_TIMEOUT_MS = 10_000
/**
 * 재연결 갭 복구의 최대 반복 조회 횟수(한 번에 20건이므로 최대 200건).
 * 계약이 깨져 커서가 전진하지 않아도 서버를 무한히 때리지 않게 하는 안전핀이다.
 */
const GAP_RECOVERY_MAX_ROUNDS = 10
const MAX_MESSAGE_LENGTH = 1000

function generateClientMessageId(): string {
  // 형식은 명세에 안 정해져 있다 — 서버 입장에선 "고유하기만 하면" 되는 멱등키.
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 메시지 목록 캐시 맨 뒤(최신 페이지)에 이어붙인다. 실시간 수신(1건)과 재연결 갭
 * 복구(여러 건) 둘 다 이걸 쓴다. message_id로 이미 있는 건 걸러낸다.
 */
function appendMessagesToCache(
  queryClient: QueryClient,
  roomId: number,
  newMessages: ChatMessage[],
) {
  if (newMessages.length === 0) return
  queryClient.setQueryData<InfiniteData<ChatMessageListResponse>>(
    ['chat', 'rooms', roomId, 'messages'],
    (old) => {
      if (!old || old.pages.length === 0) return old
      const lastIndex = old.pages.length - 1
      const lastPage = old.pages[lastIndex]
      const existingIds = new Set(lastPage.messages.map((m) => m.message_id))
      const toAdd = newMessages.filter((m) => !existingIds.has(m.message_id))
      if (toAdd.length === 0) return old
      const pages = [...old.pages]
      pages[lastIndex] = { ...lastPage, messages: [...lastPage.messages, ...toAdd] }
      return { ...old, pages }
    },
  )
}

/**
 * 캐시에 실제로 들어 있는 메시지 중 가장 최신 message_id. 읽음 발행 기준값이다.
 *
 * page_info.newest_message_id를 쓰지 않는 이유: 그 값은 REST 응답 시점에 서버가 찍어준
 * 스냅샷이라, 그 뒤 실시간으로 들어온 메시지(방 topic·개인 큐 → appendMessagesToCache)를
 * 반영하지 않는다. 그래서 예전엔 "화면엔 18번이 보이는데 읽음은 15번까지"로 나가,
 * staleTime(30초) 안에 방을 다시 열면(=리페치가 없어 스냅샷이 갱신되지 않으면) 서버에
 * 안읽음이 남아 상대 화면의 숫자가 안 사라졌다 — 방 사이를 오갈 때만 재현되던 그 버그.
 *
 * pages[0]을 쓰지 않는 이유도 같은 맥락이다: 위로 스크롤해 과거를 불러오면 그 페이지가
 * 배열 앞에 붙어서 pages[0]이 가장 오래된 페이지가 된다(ChatRoomPage의 flatMap이 이
 * 순서를 전제). 페이지별로 메시지는 시간 오름차순이라 각 페이지의 마지막 원소만 보면 된다.
 */
function newestMessageIdInCache(
  data: InfiniteData<ChatMessageListResponse> | undefined,
): number | null {
  let newest: number | null = null
  for (const page of data?.pages ?? []) {
    const last = page.messages[page.messages.length - 1]
    if (last && (newest === null || last.message_id > newest)) newest = last.message_id
  }
  return newest // 메시지가 하나도 없는 방이면 null — 읽음을 발행할 대상 자체가 없다.
}

/**
 * 삭제된 메시지를 캐시에서 "새 메시지"로 추가하지 않고, 이미 로드된 페이지들 중
 * message_id가 일치하는 항목의 content·is_deleted만 서버가 내려준 값으로 덮어쓴다.
 * 과거 페이지(위로 스크롤해서 이미 불러온 페이지)에 있을 수도 있어 전체 페이지를 훑는다.
 */
function markMessageDeletedInCache(
  queryClient: QueryClient,
  roomId: number,
  event: RoomDeletedEventFrame,
) {
  queryClient.setQueryData<InfiniteData<ChatMessageListResponse>>(
    ['chat', 'rooms', roomId, 'messages'],
    (old) => {
      if (!old) return old
      let changed = false
      const pages = old.pages.map((page) => {
        const idx = page.messages.findIndex((m) => m.message_id === event.message_id)
        if (idx === -1) return page
        changed = true
        const messages = [...page.messages]
        messages[idx] = { ...messages[idx], content: event.content, is_deleted: event.is_deleted }
        return { ...page, messages }
      })
      return changed ? { ...old, pages } : old
    },
  )
}

/**
 * 사이드바 DM 뱃지(전체 안읽음)와 대화 목록을 서버 값으로 다시 맞춘다.
 *
 * 뱃지는 개인 큐 push로 +1씩만 올리는 러닝 카운터라(handleChatRoomUpdateEvent 참고)
 * 이벤트가 유실되면(연결 끊긴 사이, 발행 순서 레이스 등) 어긋난 채 남는다. 그래서
 * "내 읽음이 확인되는 지점"과 "연결이 (다시) 붙은 지점"마다 REST 스냅샷으로 수렴시킨다
 * — 잠깐 어긋나 있어도 다음 수렴 지점에서 반드시 맞는 값으로 돌아온다.
 */
let resyncDmBadgeInFlight = false

export function resyncDmBadge(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })
  // 짧은 시간에 여러 곳(셀프에코·입장 발행 안전망)이 겹쳐 불러도 GET은 1개로 합친다
  // — api/client.ts의 재발급 공유 Promise와 같은 취지.
  if (resyncDmBadgeInFlight) return
  resyncDmBadgeInFlight = true
  void getChatUnreadCount()
    .then((count) => useBadgeStore.getState().setDmUnreadCount(count))
    .catch(() => {
      // 실패해도 옛 값 유지 — 다음 읽음·재연결 때 다시 시도된다.
    })
    .finally(() => {
      resyncDmBadgeInFlight = false
    })
}

/**
 * 개인 큐(/user/queue/updates)의 CHAT_MESSAGE 이벤트 처리. 방을 안 열어둔 화면(대화
 * 목록만 보고 있거나, 아예 다른 화면)에 있는 사람에게 새 메시지를 알려주는 용도다 —
 * 방을 열어둔 동안의 실시간 반영은 useChatRoomLive의 핸들러가 이미 따로 처리한다.
 *
 * main.tsx에서 이 큐 자체를 구독해 등록한다(컴포넌트 트리 밖, 앱 전역 1회 — CLAUDE.md
 * "개인 큐 핸들링은 socket/에 두고 각 feature가 콜백을 등록한다" 규칙).
 *
 * 뱃지는 payload의 unread_count(절대값)를 그대로 신뢰하지 않는다 — 로그인 시점엔
 * "전체 합계" 하나만 seed 해뒀지, "방마다 얼마씩"인지는 모르기 때문에 방 하나의 절대값을
 * 전체 합계에 어떻게 반영할지 알 수 없다. 대신 "이 이벤트 하나 = 새 메시지 하나"라는
 * 사실만 이용해 +1만 한다. 올리지 않는 경우 2가지:
 * - 내가 보낸 메시지의 에코(보낸 사람에게도 이 큐가 온다) — 내 안읽음이 아니다.
 * - 지금 보고 있는 방(activeDmRoomId)의 메시지 — 받는 즉시 읽음이 발행되므로,
 *   올렸다가 재동기화로 내리면 뱃지가 깜빡이기만 한다. 애초에 안 올린다.
 * +1 방식이 유실·중복으로 어긋질 수 있는 부분은 resyncDmBadge()가 읽음 확인·재연결
 * 시점마다 서버 스냅샷으로 수렴시킨다.
 */
/**
 * 대화 목록 캐시에 "이 방에 새 메시지가 왔다"를 직접 반영한다.
 *
 * 예전엔 여기서 `invalidateQueries(['chat','room-list'])`를 불렀는데, 이 목록은
 * **무한 쿼리**라 무효화 한 번에 **그때까지 로드한 모든 페이지**를 다시 받는다.
 * 메시지가 올 때마다 도는 자리라, 목록을 3페이지까지 내려둔 채 대화하면
 * 메시지 1건에 요청 3개가 나갔다(상대가 연달아 보내면 그만큼 곱해진다).
 *
 * 서버에 다시 묻지 않고 손에 있는 캐시를 고친다:
 *   1) 그 방의 마지막 메시지 미리보기를 새 메시지로 교체
 *   2) 안읽음 수는 서버가 준 절대값(unread_count)을 그대로 사용
 *   3) 목록 정렬이 (마지막 메시지 id, room_id) 내림차순이므로 그 방을 맨 앞으로 이동
 *
 * 커서 페이징이라 항목을 페이지 사이에서 옮겨도 다음 요청이 어긋나지 않는다 —
 * 다음 커서는 items가 아니라 서버가 준 page_info에서 나온다.
 *
 * 로드된 페이지에 그 방이 없으면(아직 스크롤로 도달하지 않은 방) 고칠 대상이 없으므로
 * 무효화로 넘긴다 — 이 경우는 드물고, 어차피 화면에 안 보이는 방이다.
 */
function patchRoomListWithMessage(
  queryClient: QueryClient,
  event: ChatRoomUpdateEvent,
) {
  type RoomListCache = InfiniteData<ChatRoomListResponse, unknown>
  const caches = queryClient.getQueriesData<RoomListCache>({
    queryKey: ['chat', 'room-list'],
  })

  let patchedAny = false

  for (const [key, cache] of caches) {
    if (!cache || cache.pages.length === 0) continue
    const target: ChatRoomSummary | undefined = cache.pages
      .flatMap((page) => page.rooms)
      .find((room) => room.room_id === event.room_id)
    // 이 캐시(검색 키워드가 다른 목록 등)에 없는 방이면 건너뛴다.
    if (!target) continue
    patchedAny = true

    const updated: ChatRoomSummary = {
      ...target,
      last_message: {
        message_id: event.message.message_id,
        sender_id: event.message.sender_id,
        content: event.message.content,
        is_deleted: event.message.is_deleted,
        sent_at: event.message.sent_at,
      },
      unread_count: event.unread_count,
    }

    // 원래 자리에서 빼고 맨 앞으로 올린다(정렬이 마지막 메시지 내림차순이므로).
    const pages = cache.pages.map((page) => ({
      ...page,
      rooms: page.rooms.filter((room) => room.room_id !== event.room_id),
    }))
    pages[0] = { ...pages[0], rooms: [updated, ...pages[0].rooms] }

    queryClient.setQueryData<RoomListCache>(key, { ...cache, pages })
  }

  if (!patchedAny) {
    queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })
  }
}

export function handleChatRoomUpdateEvent(
  queryClient: QueryClient,
  payload: unknown,
  myUserId: number | null,
) {
  const event = payload as ChatRoomUpdateEvent
  if (event.type !== 'CHAT_MESSAGE') return // 이 큐를 나중에 알림도 같이 쓰면 다른 type이 온다.

  // 대화 목록의 마지막 메시지 미리보기·방별 안읽음 수 갱신 — 무효화가 아니라 캐시 직접 수정.
  patchRoomListWithMessage(queryClient, event)

  // 그 방의 메시지 캐시에도 반영해 둔다 — payload의 message가 방 topic과 완전히 같은
  // DTO인 이유가 이 용도다(백엔드 주석: "두 경로의 메시지를 같은 코드로 다룬다").
  // 방 밖에서 받은 메시지를 캐시에 안 넣어두면, staleTime(30초) 안에 그 방을 다시
  // 열었을 때 리페치가 없어 새 메시지가 화면에 안 보이고, 입장 읽음 발행도 캐시의
  // 낡은 newest까지만 커버해 "내가 읽었는데 상대 화면의 안읽음 숫자가 안 사라지는"
  // 문제가 생긴다. 한 번도 안 연 방은 캐시가 없어 무시된다(첫 입장 때 REST가 채움).
  appendMessagesToCache(queryClient, event.room_id, [event.message])

  if (event.message.sender_id === myUserId) return
  if (event.room_id === useBadgeStore.getState().activeDmRoomId) return
  useBadgeStore.getState().incrementDmUnreadCount()
}

export function useCreateChatRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createChatRoom,
    // 새 방이든 재사용한 기존 방이든, 목록 화면으로 돌아갔을 때 staleTime(30초) 안에
    // 캐시된 예전 목록이 그대로 보이지 않게 무효화해서 다음 조회 때 다시 받아오게 한다.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })
    },
  })
}

/**
 * 확정된(전송 완료) 메시지 삭제. sendMessage와 대칭적인 패턴 — 이 훅은 REST 호출만
 * 하고, 화면 반영(말풍선이 "삭제된 메시지입니다"로 바뀌는 것)은 방 topic
 * (`/topic/chat/rooms/{room_id}/deleted`, useChatRoomLive의 handleDeletedFrame)이 담당한다.
 */
export function useDeleteChatMessage(roomId: number) {
  return useMutation({
    mutationFn: (messageId: number) => deleteChatMessage(roomId, messageId),
  })
}

/**
 * 대화 목록 — keyword로 참여자 이름 검색(빈 문자열이면 전체), 20개 단위 무한 스크롤.
 * 정렬 키가 (마지막 메시지 id, room_id) 두 값이라 커서도 그대로 이어받는다
 * (types.ts의 ChatRoomListResponse 주석 참고).
 */
export function useChatRooms(keyword: string) {
  const trimmed = keyword.trim()
  return useInfiniteQuery({
    // 'rooms'가 아니라 'room-list'인 이유: 메시지 캐시 키가 ['chat', 'rooms', roomId,
    // 'messages']라서, 목록을 ['chat', 'rooms', keyword]로 두면 목록 무효화(접두사 매칭)가
    // 열려 있는 방의 메시지 무한 쿼리(로드된 전체 페이지!)까지 매번 다시 불러오게 된다 —
    // 메시지가 올 때마다 목록을 무효화하므로 사실상 메시지 1건 = 전체 히스토리 리페치였다.
    queryKey: ['chat', 'room-list', trimmed],
    queryFn: ({ pageParam }) =>
      getChatRooms({
        keyword: trimmed || undefined,
        beforeLastMessageId: pageParam?.beforeLastMessageId,
        beforeRoomId: pageParam?.beforeRoomId,
      }),
    initialPageParam: undefined as
      | { beforeLastMessageId: number; beforeRoomId: number }
      | undefined,
    getNextPageParam: (lastPage) => {
      const { has_next, next_cursor_last_message_id, next_cursor_room_id } = lastPage.page_info
      if (!has_next || next_cursor_last_message_id === null || next_cursor_room_id === null) {
        return undefined
      }
      return {
        beforeLastMessageId: next_cursor_last_message_id,
        beforeRoomId: next_cursor_room_id,
      }
    },
  })
}

/**
 * 방 메시지. 초기 로드(파라미터 없음)로 최신 20개를 받고, 위로 스크롤하면
 * getPreviousPageParam으로 계산한 before 커서로 과거 방향을 이어서 받는다
 * (TanStack Query의 양방향 무한 쿼리 — fetchPreviousPage로 앞쪽에 붙는다).
 *
 * ⚠️ 이 REST 조회 자체는 읽음 처리 부수효과가 없다(실제 백엔드 ChatMessageService.
 * getMessages 확인 완료 — 순수 조회, @Transactional(readOnly = true)). 읽음은 STOMP
 * SEND /app/chat/rooms/{room_id}/read로 명시적으로 알려야 서버가 처리한다. 발행은
 * "화면이 아는 가장 최신 message_id가 전진할 때마다"다(워터마크 — 아래 ref 주석 참고):
 * 입장 시 캐시/초기 로드 기준으로 한 번, 이후 리페치·실시간 수신으로 newest가 갱신되면
 * 그때마다 따라간다. 안읽음 수·뱃지 반영은 서버가 되돌려주는
 * /topic/chat/rooms/{room_id}/read 이벤트(useChatRoomLive의 handleReadFrame) +
 * 발행 후 재동기화 안전망(resyncDmBadge)이 담당한다.
 */
export function useChatMessages(roomId: number) {
  const queryClient = useQueryClient()
  const socketStatus = useStompConnectionStatus()
  // 방별 "여기까지 읽음 발행했다" 워터마크. 입장 1회 플래그가 아니라 워터마크인 이유:
  // 입장 직후 캐시(낡은 newest)로 한 번 발행하고 끝내면, 곧이어 리페치·실시간 수신으로
  // newest가 전진해도 읽음이 따라가지 않아 서버 안읽음이 남는다 — "내가 다 읽었는데
  // 상대 화면의 숫자가 안 사라지는" 문제의 원인이었다. newest가 워터마크를 넘을 때마다
  // 다시 발행한다(값이 같으면 서버가 moved=false로 무시하므로 중복 발행도 무해).
  const readWatermarkRef = useRef<{ roomId: number; messageId: number } | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['chat', 'rooms', roomId, 'messages'],
    queryFn: ({ pageParam }) =>
      getChatMessages(roomId, pageParam !== undefined ? { before: pageParam } : undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: () => undefined, // 최신 방향으로는 더 안 감 — 초기 로드가 이미 최신 페이지
    getPreviousPageParam: (firstPage) =>
      firstPage.page_info.has_previous
        ? (firstPage.page_info.oldest_message_id ?? undefined)
        : undefined,
  })

  useEffect(() => {
    // 서버 스냅샷(page_info)이 아니라 캐시의 실제 최신 메시지를 기준으로 삼는다 —
    // 실시간 수신분까지 포함되므로 리페치 없이도 항상 최신이다(newestMessageIdInCache 주석).
    const newestMessageId = newestMessageIdInCache(query.data)
    if (newestMessageId == null) return
    // 연결 전에 발행하면 publishStomp가 조용히 버린다(fire-and-forget) — 새로고침 직후엔
    // REST(메시지 조회)가 STOMP 연결보다 먼저 끝나는 일이 흔해서, 여기서 걸러주지 않으면
    // 입장 읽음이 통째로 유실된다. socketStatus가 deps에 있어 연결되면 다시 시도된다.
    if (socketStatus !== 'connected') return
    const watermark = readWatermarkRef.current
    if (watermark && watermark.roomId === roomId && watermark.messageId >= newestMessageId) return

    // 매크로태스크로 한 박자 미룬다: 캐시된 방에 재입장하면 데이터가 첫 렌더부터 있어
    // 이 effect가 useChatRoomLive의 구독 effect보다 먼저 실행되는데(훅 호출 순서 = effect
    // 실행 순서), 그대로 보내면 읽음 SEND가 /read SUBSCRIBE보다 먼저 나간다. 서버는 받는
    // 즉시 브로드캐스트하므로 아직 구독 전인 나만 셀프에코를 놓친다 — "서버가 셀프에코를
    // 안 준다"로 보였던 실측의 정체가 이 레이스다(백엔드는 topic 전체 브로드캐스트가 맞음).
    const timer = setTimeout(() => {
      const published = publishStomp(`/app/chat/rooms/${roomId}/read`, {
        last_read_message_id: newestMessageId,
      })
      if (!published) return // 그 사이 끊겼으면 워터마크를 안 올렸으니 다음 연결 때 재시도된다.
      readWatermarkRef.current = { roomId, messageId: newestMessageId }
      // 셀프에코가 어떤 이유로든 안 와도(위 레이스, 이미 최신이라 서버가 이벤트를 생략하는
      // 경우 등) 뱃지가 옛 값에 갇히지 않게, 서버가 읽음을 반영할 시간을 조금 주고 직접
      // 재동기화한다. 에코가 정상히 오면 같은 값을 한 번 더 맞추는 것뿐이라 무해하다.
      setTimeout(() => resyncDmBadge(queryClient), 400)
    }, 0)
    return () => clearTimeout(timer)
  }, [query.data, roomId, socketStatus, queryClient])

  return query
}

/**
 * 방 관련 topic 3개(메시지·읽음·삭제) 구독 + 메시지 전송을 함께 다룬다. 메시지 전송을
 * 같이 두는 이유는 "보낸 메시지가 성공했는지"를 메시지 topic으로 받는 에코로만 알 수
 * 있어서(SEND는 fire-and-forget, 응답이 없음) — 전송과 확인이 원래 한 쌍이다.
 *
 * 채팅방 화면에 들어가 있는 동안만 구독이 살아있고, 나가면(언마운트) 자동 해제된다
 * (socket/useSubscription.ts).
 *
 * - `/topic/chat/rooms/{room_id}` (새 메시지): useChatMessages의 무한 쿼리 캐시 맨
 *   뒤(최신 페이지)에 직접 이어붙인다. client_message_id가 내가 보낸 pending 메시지와
 *   일치하면 그 pending 항목은 지운다(= 전송 확정). 중복(에코 재수신 등)은 message_id로
 *   걸러낸다.
 * - `/topic/chat/rooms/{room_id}/read` (읽음): 나를 포함해 참여자 전원이 각자 어디까지
 *   읽었는지 `readPositions`(user_id -> last_read_message_id)로 들고 있다가, 화면
 *   (ChatRoomPage)이 각 메시지마다 "아직 안 읽은 사람 수"(카카오톡처럼 0이 되면 사라짐)를
 *   계산할 때 쓴다 — 보낸 사람뿐 아니라 방에 있는 모두에게 똑같이 보인다. 메시지 topic과
 *   주소가 분리돼 있다 — 방 topic 프레임엔 type 판별 필드가 없어서, 같은 주소로 왔다면
 *   읽음 이벤트를 새 메시지로 착각했을 것이다.
 *
 * 읽음 이벤트 발행(SEND /app/chat/rooms/{room_id}/read)도 여기서 한다 — 방을 보고
 * 있는 동안(이 훅이 살아있는 동안) 상대가 보낸 새 메시지가 오면 즉시 발행한다. 내가
 * 보낸 메시지는 발행 대상이 아니다(스스로 읽음 처리할 필요 없음). "나중에 입장"
 * 케이스(이미 쌓여있던 안읽은 메시지)는 useChatMessages가 초기 로드 시 따로 발행한다.
 *
 * 개인 에러 큐(/user/queue/errors)도 여기서 구독한다 — 서버가 이 방에서의 SEND(전송·
 * 읽음)를 거부했을 때(1000자 초과, 참여자 아님 등) 돌려주는 에러다. payload에
 * client_message_id가 없어 "어느 pending 메시지 때문인지"는 특정할 수 없다 — 그래서
 * 특정 말풍선이 아니라 화면 공통 에러 배너(errorMessage)로 보여준다.
 */
export function useChatRoomLive(
  roomId: number,
  myInitialLastReadMessageId?: number | null,
  counterparts?: ChatRoomCounterpart[],
) {
  const queryClient = useQueryClient()
  const myUserId = useAuthStore((state) => state.userId)
  // 참여자 전원(나 포함)의 읽음 위치. user_id -> last_read_message_id. "이 메시지를 아직
  // 안 읽은 사람 수"를 계산하려면 나를 뺀 나머지가 아니라 "메시지를 보낸 사람 빼고 전원"이
  // 필요해서 내 위치도 같이 들고 있는다. 세션 중 받은 읽음 이벤트로 갱신되고, 입장 시
  // 한 번은 방 목록 응답으로 seed된다 — 내 것은 myInitialLastReadMessageId, 상대들 것은
  // counterparts[].last_read_message_id(feature/be-chat-counterpart-read로 추가된 필드,
  // 안 읽었으면 필드 자체가 응답에 없음)로 채운다. 이게 없던 때는 상대가 그동안 아무것도
  // 새로 안 읽었으면 새로고침할 때마다 이미 읽은 메시지도 안읽음으로 잘못 보이는 문제가
  // 있었다 — 이제 진입 시점 스냅샷이 있어 그 문제가 해소된다.
  const [readPositions, setReadPositions] = useState<Map<number, number>>(new Map())
  const [pendingMessages, setPendingMessages] = useState<PendingChatMessage[]>([])
  // 최신 목록을 updater 밖에서도 읽기 위한 거울(재전송 시 부수효과를 updater에 넣지 않으려고).
  const pendingMessagesRef = useRef<PendingChatMessage[]>(pendingMessages)
  pendingMessagesRef.current = pendingMessages
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // clientMessageId -> 에코 타임아웃 타이머. 에코 도착·재전송·삭제 시 정리한다.
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  /**
   * 방을 옮기면(roomId가 바뀌면) 이전 방에 속한 상태를 전부 비운다
   * — 이 컴포넌트는 방을 옮겨도 리마운트되지 않는다(라우트 param만 바뀜).
   *
   * 읽음 상태뿐 아니라 **전송 대기 중인 메시지와 그 에코 타임아웃까지** 함께 비워야 한다.
   * 예전엔 readPositions만 비워서, A방에서 전송 실패한 말풍선이 B방 대화창에 그대로
   * 남았고 거기서 재전송을 누르면 publish가 **B방 destination으로 A방 내용을 발행**했다
   * (publish는 현재 roomId로 만들어진다). 남은 타이머도 정리하지 않으면 B방에 있는
   * 동안 A방 메시지가 'failed'로 바뀐다.
   */
  useEffect(() => {
    setReadPositions(new Map())
    setPendingMessages([])
    setErrorMessage(null)
    const timeouts = timeoutsRef.current
    timeouts.forEach((timer) => clearTimeout(timer))
    timeouts.clear()
  }, [roomId])

  // 이 방을 보는 동안은 개인 큐 push를 뱃지에 올리지 않도록 표시해 둔다
  // (handleChatRoomUpdateEvent가 이 값을 보고 건너뛴다). 나가면 해제.
  useEffect(() => {
    const { setActiveDmRoomId } = useBadgeStore.getState()
    setActiveDmRoomId(Number.isFinite(roomId) ? roomId : null)
    return () => setActiveDmRoomId(null)
  }, [roomId])

  // 읽음 위치 초기값 seed(나 + 상대 전원). roomId 리셋 다음에 실행되도록 선언 순서를 맞췄다
  // (같은 커밋에서 비우고 바로 다시 채워야 깜빡임 없이 이어진다).
  //
  // 값이 있으면 무조건 덮어쓰지 않고 Math.max로 병합한다 — last_read_message_id는
  // 절대 줄어들지 않으므로 max가 항상 안전하다. 이게 중요한 이유: 재연결 갭 복구(아래
  // 참고)로 counterparts 스냅샷이 새로 들어올 때도 이 effect가 다시 돈다. 예전처럼
  // "이미 값이 있으면 스킵"이었다면, 연결이 끊긴 동안 놓친 읽음 이벤트는 재연결 뒤
  // 새로고침하기 전까지 영원히 반영이 안 됐다(그룹 채팅에서 재현된 버그의 원인).
  useEffect(() => {
    if (myUserId === null) return
    setReadPositions((prev) => {
      const next = new Map(prev)
      let changed = false
      const merge = (userId: number, value: number | null | undefined) => {
        if (value == null) return
        const merged = Math.max(next.get(userId) ?? 0, value)
        if (merged !== next.get(userId)) {
          next.set(userId, merged)
          changed = true
        }
      }
      merge(myUserId, myInitialLastReadMessageId)
      for (const c of counterparts ?? []) merge(c.user_id, c.last_read_message_id)
      return changed ? next : prev
    })
  }, [roomId, myInitialLastReadMessageId, myUserId, counterparts])

  useEffect(() => {
    return onPersonalErrorMessage((payload) => {
      setErrorMessage((payload as StompErrorPayload).message)
    })
  }, [])

  const dismissError = useCallback(() => setErrorMessage(null), [])

  const clearPendingTimeout = useCallback((clientMessageId: string) => {
    const timer = timeoutsRef.current.get(clientMessageId)
    if (timer) {
      clearTimeout(timer)
      timeoutsRef.current.delete(clientMessageId)
    }
  }, [])

  const destination = Number.isFinite(roomId) ? `/topic/chat/rooms/${roomId}` : null

  const handleFrame = useCallback(
    (payload: unknown) => {
      // 이 topic엔 항상 새 메시지 하나만 온다 — 읽음·삭제는 별도 topic으로 분리돼 있다.
      const frame = payload as RoomTopicMessageFrame

      if (frame.client_message_id) {
        clearPendingTimeout(frame.client_message_id)
        setPendingMessages((prev) =>
          prev.filter((m) => m.client_message_id !== frame.client_message_id),
        )
      }
      appendMessagesToCache(queryClient, roomId, [frame])
      // 대화 목록 갱신은 여기서 하지 않는다. 방 topic 프레임과 개인 큐 이벤트가 **같은
      // 메시지에 대해 둘 다** 오므로(개인 큐는 다른 화면에 있는 사람용) 여기서도 손대면
      // 메시지 1건에 목록 갱신이 두세 번 겹친다. 목록은 개인 큐 핸들러
      // (handleChatRoomUpdateEvent → patchRoomListWithMessage) 한 곳에서만 맞춘다.

      // 상대가 보낸 메시지를 지금 방을 보고 있는 중에 실시간으로 받았다 = 바로 읽음.
      // 내가 보낸 메시지(에코)는 스스로 읽음 처리할 필요가 없으니 대상에서 뺀다.
      if (frame.sender_id !== myUserId) {
        publishStomp(`/app/chat/rooms/${roomId}/read`, {
          last_read_message_id: frame.message_id,
        })
      }
    },
    [queryClient, roomId, clearPendingTimeout, myUserId],
  )

  useSubscription(destination, handleFrame)

  // 읽음 이벤트 — 서버는 topic 전체 브로드캐스트라 발행자 본인(나)에게도 온다.
  // (예전 주석은 "셀프에코 없음(실측)"이라 봤지만, 실제 원인은 캐시된 방 재입장 때
  // 읽음 SEND가 /read SUBSCRIBE보다 먼저 나가는 발행 순서 레이스였다 — useChatMessages가
  // 발행을 한 박자 미뤄 해결. 백엔드 코드(ChatStompController.read)상 셀프에코 제외는 없다.)
  // 내 읽음(frame.user_id === myUserId)이 확인되면 뱃지·목록을 재동기화한다 — 다른
  // 기기에서 읽은 경우에도 이 분기로 이 기기의 뱃지가 따라 맞춰진다.
  const readDestination = Number.isFinite(roomId) ? `/topic/chat/rooms/${roomId}/read` : null
  const handleReadFrame = useCallback(
    (payload: unknown) => {
      const frame = payload as RoomReadEventFrame
      setReadPositions((prev) => {
        const next = new Map(prev)
        next.set(frame.user_id, frame.last_read_message_id)
        return next
      })
      if (frame.user_id === myUserId) {
        resyncDmBadge(queryClient)
      }
    },
    [myUserId, queryClient],
  )
  useSubscription(readDestination, handleReadFrame)

  // 삭제 이벤트 — 새 메시지로 추가하지 않고 기존 메시지의 content·is_deleted만 덮어쓴다.
  const deletedDestination = Number.isFinite(roomId)
    ? `/topic/chat/rooms/${roomId}/deleted`
    : null
  const handleDeletedFrame = useCallback(
    (payload: unknown) => {
      markMessageDeletedInCache(queryClient, roomId, payload as RoomDeletedEventFrame)
      // 지워진 메시지가 방의 마지막 메시지였다면 목록 미리보기도 바뀌어야 한다.
      queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })
    },
    [queryClient, roomId],
  )
  useSubscription(deletedDestination, handleDeletedFrame)

  // 재연결 갭 복구: 끊겼다가 다시 붙는 동안 놓친 메시지를, 캐시에 있는 가장 최근
  // message_id 기준으로 after 조회해서 채운다(메시지 조회 명세의 ③번 용도).
  // status가 'reconnecting'에서 'connected'로 바뀔 때만 한다 — 'connecting'→'connected'는
  // 최초 접속이라 복구할 갭 자체가 없다(초기 로드가 이미 최신 상태를 준다).
  const socketStatus = useStompConnectionStatus()
  const prevSocketStatusRef = useRef(socketStatus)

  useEffect(() => {
    const prevStatus = prevSocketStatusRef.current
    prevSocketStatusRef.current = socketStatus
    if (prevStatus !== 'reconnecting' || socketStatus !== 'connected') return

    // 읽음 위치도 같은 갭의 영향을 받는다 — 끊긴 동안 놓친 읽음 브로드캐스트는 재전송이
    // 안 되므로, 대화 목록을 무효화해서 counterparts[].last_read_message_id 스냅샷을
    // 새로 받아온다. 위쪽 seed effect가 이 값을 Math.max로 병합해 놓친 만큼 따라잡는다.
    queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })

    const cached = queryClient.getQueryData<InfiniteData<ChatMessageListResponse>>([
      'chat',
      'rooms',
      roomId,
      'messages',
    ])
    const lastPage = cached?.pages[cached.pages.length - 1]
    const lastMessage = lastPage?.messages[lastPage.messages.length - 1]
    if (!lastMessage) return // 아직 메시지를 한 번도 못 받았으면(초기 로드 전) 복구할 갭이 없다.

    /**
     * has_next가 true면 **끊긴 동안 쌓인 게 한 페이지를 넘었다는 뜻**이라 이어서 더 받는다.
     * 한 번만 조회하던 시절엔 활성 그룹방에서 수십 초만 끊겨도(한 응답이 20건 상한)
     * 오래된 20건만 채워지고 나머지는 캐시에 안 들어왔다. 그 뒤 실시간 수신분은 마지막
     * 페이지 뒤에 붙으므로 화면상 대화 중간이 빈 채로 이어졌고, 읽음 워터마크도 실제
     * 최신보다 뒤처진 id로 발행됐다.
     *
     * 커서는 직전 응답의 newest_message_id다. 서버가 안 주면(빈 응답 등) 멈춘다.
     * 반복 상한을 두는 이유: 커서가 전진하지 않는 계약 위반이 생겨도 무한 루프로
     * 서버를 때리지 않게 하려는 안전핀이다. 상한에 걸린 나머지는 다음 재연결 때 이어받는다.
     */
    const recoverGap = async (afterMessageId: number) => {
      let cursor = afterMessageId
      let received = 0
      for (let round = 0; round < GAP_RECOVERY_MAX_ROUNDS; round += 1) {
        const result = await getChatMessages(roomId, { after: cursor })
        appendMessagesToCache(queryClient, roomId, result.messages)
        received += result.messages.length
        const nextCursor = result.page_info.newest_message_id
        if (!result.page_info.has_next || nextCursor === null || nextCursor <= cursor) break
        cursor = nextCursor
      }
      if (received > 0) {
        queryClient.invalidateQueries({ queryKey: ['chat', 'room-list'] })
      }
    }

    void recoverGap(lastMessage.message_id).catch(() => {
      // 갭 복구 실패해도 앱은 계속 써야 한다 — 메시지 몇 개를 못 받는 정도로 감수한다.
      // 다음 재연결 때 다시 시도되므로 별도 재시도 로직은 안 둔다.
    })
  }, [socketStatus, queryClient, roomId])

  const publish = useCallback(
    (clientMessageId: string, content: string) => {
      setErrorMessage(null) // 새로 시도하니 이전 에러 배너는 치운다.
      const published = publishStomp(`/app/chat/rooms/${roomId}/messages`, {
        client_message_id: clientMessageId,
        content,
      })
      if (!published) {
        // 연결 자체가 안 돼있으면 에코를 기다릴 것도 없이 바로 실패 처리.
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
          ),
        )
        return
      }
      const timer = setTimeout(() => {
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMessageId ? { ...m, status: 'failed' } : m,
          ),
        )
        timeoutsRef.current.delete(clientMessageId)
      }, SEND_ECHO_TIMEOUT_MS)
      timeoutsRef.current.set(clientMessageId, timer)
    },
    [roomId],
  )

  /** content가 비었거나 1000자를 넘으면 조용히 무시한다 — 버튼 disabled로 이미 막아둘 것. */
  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return

      const clientMessageId = generateClientMessageId()
      setPendingMessages((prev) => [
        ...prev,
        {
          client_message_id: clientMessageId,
          content: trimmed,
          sent_at: new Date().toISOString(),
          status: 'pending',
        },
      ])
      publish(clientMessageId, trimmed)
    },
    [publish],
  )

  const retryMessage = useCallback(
    (clientMessageId: string) => {
      // updater는 순수해야 한다. 안에서 publish를 부르면 React가 updater를 두 번
      // 실행하는 상황(StrictMode 개발 모드)에서 같은 client_message_id로 SEND가 두 번
      // 나가고, 타이머 Map도 덮어써져 첫 타이머가 정리되지 않은 채 남는다.
      const target = pendingMessagesRef.current.find(
        (m) => m.client_message_id === clientMessageId,
      )
      if (!target) return
      publish(clientMessageId, target.content)
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.client_message_id === clientMessageId ? { ...m, status: 'pending' } : m,
        ),
      )
    },
    [publish],
  )

  const deletePendingMessage = useCallback(
    (clientMessageId: string) => {
      clearPendingTimeout(clientMessageId)
      setPendingMessages((prev) => prev.filter((m) => m.client_message_id !== clientMessageId))
    },
    [clearPendingTimeout],
  )

  // 언마운트(방을 나갈 때) 남은 타이머를 전부 정리한다.
  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      timeouts.forEach((timer) => clearTimeout(timer))
      timeouts.clear()
    }
  }, [])

  return {
    readPositions,
    pendingMessages,
    sendMessage,
    retryMessage,
    deletePendingMessage,
    errorMessage,
    dismissError,
  }
}

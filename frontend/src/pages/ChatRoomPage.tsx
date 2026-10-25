import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  useChatMessages,
  useChatRooms,
  useChatRoomLive,
  useDeleteChatMessage,
} from '@/features/chat/hooks'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { formatDayLabel, formatTimeLabel, roomDisplayName } from '@/features/chat/format'
import { useStompConnectionStatus } from '@/socket/stompClient'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import { toRouteId } from '@/hooks/routeId'

const MAX_MESSAGE_LENGTH = 1000

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function GroupAvatar() {
  return (
    <span
      aria-hidden
      className="border-line bg-surface-muted text-ink/[.66] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="1.7" {...ICON_PROPS}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    </span>
  )
}

/** 시안 말풍선 공통 수치 — 14.5px / lh 1.62 / padding 11×15. */
const BUBBLE_BASE =
  'w-fit px-[15px] py-[11px] text-[14.5px] leading-[1.62] whitespace-pre-wrap [overflow-wrap:anywhere]'

/**
 * 말풍선 폭 제한 — 시안 cap 88%(모바일)·min(66%,460px)(데스크톱).
 * ⚠️ 반드시 "행의 직접 자식"(전체 폭이 확정된 부모의 자식)에 걸어야 한다.
 * 내용 크기로 줄어드는 래퍼 안쪽에 걸면 %의 기준이 사라져 말풍선이
 * 한 글자 폭으로 무너진다(세로 출력).
 */
const BUBBLE_CAP = 'max-w-[88%] md:max-w-[min(66%,460px)]'

/**
 * 우클릭 메뉴 크기의 상한(px)과 화면 가장자리 여백.
 *
 * 메뉴는 폭을 고정하지 않고 글자에 맞춰 줄어든다(w-max). 항목이 '메시지 삭제' 하나뿐이라
 * 실제 폭은 140px 안쪽이고, 여기 값은 **화면 밖으로 나가지 않게 당길 때만** 쓰는 상한이다.
 * 넉넉하면 가장자리에서 조금 더 당겨질 뿐이지만, 모자라면 메뉴가 잘린다.
 * 항목이 늘거나 문구가 길어지면 이 값도 같이 올린다.
 */
/** 방 정보를 목록에서 찾을 때 추가로 받아올 페이지 수 상한(1페이지 20개). */
const MAX_ROOM_LOOKUP_ROUNDS = 10

const MENU_MAX_W = 150
const MENU_MAX_H = 56
const EDGE_GAP = 8

/**
 * 채팅방 — 메시지 조회·전송·삭제·방 topic 실시간 구독까지 구현.
 * 레이아웃·말풍선·삭제 UX(우클릭 메뉴 → 확인 다이얼로그)는 시안 Chat.dc.html과 1:1.
 *
 * WebSocket 연결 자체는 여기서 만들지 않는다 — 앱 전역 1개(CLAUDE.md 규칙 5,
 * socket/stompClient.ts). 이 화면은 입장 시 방 topic만 구독하고 퇴장 시 해제한다
 * (useChatRoomLive → socket/useSubscription.ts). 연결이 안 돼있으면 전송 자체를
 * 막아둔다(아래 입력창 disabled 조건).
 */
export default function ChatRoomPage() {
  const { roomId: roomIdParam } = useParams()
  // Number()는 'abc' → NaN, 'Infinity' → Infinity를 그대로 통과시킨다.
  // 그대로 두면 /api/chat/rooms/NaN 같은 요청이 나가거나 로딩이 영영 끝나지 않는다.
  const roomId = toRouteId(roomIdParam)
  const myUserId = useAuthStore((state) => state.userId)
  const socketStatus = useStompConnectionStatus()

  /*
   * 방 헤더(상대 닉네임/그룹명)는 대화 목록 캐시에서 찾는다 — 별도 "방 상세 조회" API가 없다.
   *
   * 목록은 20개씩 커서 페이징이라 **첫 페이지에만 의존하면 21번째 이후 방을 못 찾는다.**
   * 그 상태로는 헤더가 '채팅방 #57', 받은 메시지 발신자가 전부 '알 수 없음', 새 메시지
   * 구분선도 안 뜬다. /chat/57로 새로고침하거나 프로필의 '메시지 보내기'로 방금 만든
   * 방(메시지가 없어 정렬 최하단)에 들어가면 바로 재현된다.
   * 그래서 못 찾은 동안에는 다음 페이지를 이어서 받는다. 상한을 둬서 방이 아주 많은
   * 계정에서 목록 전체를 긁는 일은 막는다(대개 최근 방이라 몇 페이지 안에 나온다).
   */
  const {
    data: roomPages,
    fetchNextPage: fetchMoreRooms,
    hasNextPage: hasMoreRooms,
    isFetchingNextPage: isFetchingMoreRooms,
  } = useChatRooms('')
  const rooms = roomPages?.pages.flatMap((page) => page.rooms)
  const room = rooms?.find((r) => r.room_id === roomId)

  const roomLookupRoundsRef = useRef(0)
  useEffect(() => {
    roomLookupRoundsRef.current = 0
  }, [roomId])
  useEffect(() => {
    if (room || !hasMoreRooms || isFetchingMoreRooms) return
    if (roomLookupRoundsRef.current >= MAX_ROOM_LOOKUP_ROUNDS) return
    roomLookupRoundsRef.current += 1
    void fetchMoreRooms()
  }, [room, hasMoreRooms, isFetchingMoreRooms, fetchMoreRooms])

  /** 아직 목록에서 찾는 중 — '알 수 없음' 대신 조용히 비워 둔다. */
  const isResolvingRoom =
    !room && (isFetchingMoreRooms || (hasMoreRooms && roomLookupRoundsRef.current < MAX_ROOM_LOOKUP_ROUNDS))
  // 메시지엔 sender_id만 오고 닉네임·프사가 없다 — 받은 메시지의 프사·이름 표시를 위해
  // 같은 방 응답의 counterparts(참여자 정보)로 조회 테이블을 만든다(API 추가 호출 없음).
  const senderById = new Map(room?.counterparts.map((c) => [c.user_id, c]))

  const {
    data,
    isPending,
    hasPreviousPage,
    isFetchingPreviousPage,
    fetchPreviousPage,
  } = useChatMessages(roomId)
  const {
    readPositions,
    pendingMessages,
    sendMessage,
    retryMessage,
    deletePendingMessage,
    errorMessage,
    dismissError,
  } = useChatRoomLive(roomId, room?.last_read_message_id, room?.counterparts)
  const { mutate: deleteMessage } = useDeleteChatMessage(roomId)

  // 방의 참여자 전원(나 포함) — "이 메시지를 아직 안 읽은 사람 수" 계산에 쓴다.
  const allMemberIds =
    room && myUserId !== null ? [myUserId, ...room.counterparts.map((c) => c.user_id)] : []

  // "새 메시지" 구분선 — 방에 들어온 시점의 내 읽음 위치(room.last_read_message_id)를
  // roomId별로 한 번만 캡처해서 고정한다. 캡처 없이 room.last_read_message_id를 매번
  // 그대로 쓰면, 입장하자마자 useChatMessages가 읽음을 발행해 위치가 바로 최신으로
  // 갱신돼버려서 구분선이 뜰 새도 없이 사라진다.
  const capturedReadBoundaryRef = useRef<{ roomId: number; value: number | null } | null>(null)
  useEffect(() => {
    if (room && capturedReadBoundaryRef.current?.roomId !== roomId) {
      capturedReadBoundaryRef.current = { roomId, value: room.last_read_message_id }
    }
  }, [roomId, room])
  const readBoundary =
    capturedReadBoundaryRef.current?.roomId === roomId
      ? capturedReadBoundaryRef.current.value
      : undefined

  // 내 메시지 우클릭 컨텍스트 메뉴 → 삭제 확인 다이얼로그 (시안 흐름).
  const [menu, setMenu] = useState<{ x: number; y: number; id: number } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** 메뉴를 연 버튼 — 닫을 때 포커스를 되돌린다(우클릭으로 열었으면 없다). */
  const menuTriggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!(menuRef.current && menuRef.current.contains(e.target as Node))) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)

    // 열리면 첫 항목으로 포커스를 옮기고, 닫히면 열었던 버튼으로 되돌린다.
    // 이게 없으면 스크린리더 사용자는 메뉴가 열린 사실을 모르고, Tab을 누르면
    // 포커스가 메뉴 밖으로 새어 나간다.
    const trigger = menuTriggerRef.current
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()

    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      // 삭제 확인 모달이 이어서 열리는 경우엔 모달이 다시 포커스를 가져간다(Modal의 규칙).
      if (trigger?.isConnected) trigger.focus()
    }
  }, [menu])

  function openMessageMenu(e: React.MouseEvent, messageId: number) {
    e.preventDefault()
    menuTriggerRef.current = null
    setMenu({
      // 화면 밖으로 나가지 않게 눌린 지점을 당겨 온다. 상한값이라 실제 메뉴보다 넉넉해도
      // 가장자리에서만 조금 더 당겨질 뿐 위치가 어긋나지 않는다 — 반대로 모자라면 잘린다.
      x: Math.min(e.clientX, window.innerWidth - MENU_MAX_W - EDGE_GAP),
      y: Math.min(e.clientY, window.innerHeight - MENU_MAX_H - EDGE_GAP),
      id: messageId,
    })
  }

  /** 버튼(⋯)으로 메뉴를 열 때 — 좌표는 버튼 위치에서 뽑고, 닫힐 때 여기로 포커스를 되돌린다. */
  function openMessageMenuFromTrigger(trigger: HTMLElement, messageId: number) {
    menuTriggerRef.current = trigger
    const rect = trigger.getBoundingClientRect()
    setMenu({
      x: Math.min(rect.left, window.innerWidth - MENU_MAX_W - EDGE_GAP),
      y: Math.min(rect.bottom + 4, window.innerHeight - MENU_MAX_H - EDGE_GAP),
      id: messageId,
    })
  }

  function confirmDelete() {
    if (confirmDeleteId !== null) deleteMessage(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  const messages = data?.pages.flatMap((page) => page.messages) ?? []
  // 읽음 경계(readBoundary) 이후, 상대가 보낸 첫 메시지 앞에 구분선을 그린다. 내가 보낸
  // 메시지는 대상에서 뺀다 — 안 그러면 방금 내가 보낸 메시지 위에 구분선이 뜰 수 있다.
  const firstUnreadMessageId =
    readBoundary !== undefined
      ? messages.find((m) => m.sender_id !== myUserId && m.message_id > (readBoundary ?? 0))
          ?.message_id
      : undefined

  const scrollRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const hasScrolledToBottom = useRef(false)
  const prevScrollHeightRef = useRef(0)

  // "새 메시지 보기" 버튼은 누르면(=구분선으로 이동해서 봤으면) 다시 뜨지 않게 감춘다.
  // 방을 옮기면 다음 방의 안읽은 메시지에 대해 다시 보여야 하니 roomId가 바뀌면 리셋한다.
  const [unreadButtonDismissed, setUnreadButtonDismissed] = useState(false)
  useEffect(() => {
    setUnreadButtonDismissed(false)
    // 스크롤 ref도 같이 되돌린다. 라우트 param만 바뀌므로 이 컴포넌트는 리마운트되지 않고,
    // 스크롤 컨테이너 DOM도 재사용돼 scrollTop이 그대로 남는다. hasScrolledToBottom이
    // 첫 방에서 true가 된 뒤 계속 true라, 방을 옮겨도 새 방의 최신 메시지로 안 내려갔다.
    hasScrolledToBottom.current = false
    prevScrollHeightRef.current = 0
  }, [roomId])

  function scrollToUnreadDivider() {
    dividerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setUnreadButtonDismissed(true)
  }

  // 초기 로드가 끝나면 맨 아래(최신 메시지)로 스크롤한다.
  useEffect(() => {
    if (!hasScrolledToBottom.current && messages.length > 0 && scrollRef.current) {
      hasScrolledToBottom.current = true
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // 과거 메시지를 위에 이어붙이면 그만큼 스크롤 위치를 보정한다 — 안 하면 붙는 순간
  // 화면이 맨 위로 튀어서, 방금 보던 메시지가 어디 갔는지 알 수 없게 된다.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || prevScrollHeightRef.current === 0) return
    el.scrollTop += el.scrollHeight - prevScrollHeightRef.current
    prevScrollHeightRef.current = 0
  }, [messages.length])

  // 실시간으로 새 메시지가 도착했을 때(과거 페이징이 아닐 때), 이미 바닥 근처를 보고
  // 있었으면 새 메시지를 따라 같이 내려간다. 위로 스크롤해서 지난 대화를 읽는 중이면
  // 방해하지 않는다. 내가 보낸 메시지(pending)도 같은 방식으로 따라 내려간다.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !hasScrolledToBottom.current || prevScrollHeightRef.current !== 0) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 150) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length, pendingMessages.length])

  const topSentinelRef = useIntersectionObserver(
    () => {
      if (!hasPreviousPage || isFetchingPreviousPage || !scrollRef.current) return
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
      fetchPreviousPage()
    },
    { enabled: hasPreviousPage && !isFetchingPreviousPage },
  )

  const [draft, setDraft] = useState('')
  const canSend = draft.trim().length > 0 && draft.length <= MAX_MESSAGE_LENGTH && socketStatus === 'connected'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    sendMessage(draft)
    setDraft('')
  }

  // 메시지 목록에 날짜 구분선을 끼워 넣는다 — sent_at에서 파생만 할 뿐 API 호출은 없다.
  let dayCursor = ''

  return (
    <div className="bg-surface-muted flex h-full flex-col">
      {/* 방 헤더 — 시안 inner max 760px 중앙, 모바일은 목록으로 돌아가는 ← 버튼 */}
      <div className="border-line border-b">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 px-4 py-3.5 md:px-5">
          <Link
            to="/chat"
            aria-label="대화 목록으로"
            className="text-ink -ml-2 flex h-10 w-10 flex-none items-center justify-center rounded-[10px] md:hidden"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="1.75" {...ICON_PROPS} aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          {room?.room_type === 'GROUP' ? (
            <GroupAvatar />
          ) : (
            <UserAvatar
              user={{
                nickname: room?.counterparts[0]?.nickname,
                profile_image_url: room?.counterparts[0]?.profile_image_url,
              }}
              className="h-10 w-10"
            />
          )}
          <div className="flex min-w-0 flex-col gap-[3px]">
            <p className="text-ink truncate text-[15px] font-semibold tracking-[-0.01em]">
              {room ? roomDisplayName(room) : isResolvingRoom ? '불러오는 중...' : `채팅방 #${roomId}`}
            </p>
            {room?.room_type === 'GROUP' && (
              <p className="text-ink/[.58] text-[11px] tracking-[0.02em]">
                참여자 {room.counterparts.length + 1}명
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {firstUnreadMessageId !== undefined && !unreadButtonDismissed && (
          <button
            type="button"
            onClick={scrollToUnreadDivider}
            className="bg-brand hover:bg-brand-hover absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white shadow-md transition-colors"
          >
            새 메시지 보기 ↓
          </button>
        )}

        <div ref={scrollRef} className="h-full overflow-y-auto [scrollbar-gutter:stable] px-4 pt-[18px] pb-[22px] md:px-5 md:pt-[22px] md:pb-[26px]">
          <div className="mx-auto w-full max-w-[760px]">
            {isPending && <p className="text-ink-muted text-center text-sm">불러오는 중...</p>}

            {hasPreviousPage && <div ref={topSentinelRef} className="h-1" />}
            {isFetchingPreviousPage && (
              <p className="text-ink-muted py-2 text-center text-sm">이전 메시지 불러오는 중...</p>
            )}

            <div className="flex flex-col gap-1">
              {messages.map((message) => {
                const isMine = message.sender_id === myUserId
                // 카카오톡처럼 "전체 인원 - 읽은 사람 수"를 보낸 사람뿐 아니라 방에 있는
                // 모두에게 똑같이 보여준다 — message.sender_id만 빼고, 나까지 포함한
                // allMemberIds 전원의 읽음 위치를 검사한다. 0이 되면(다 읽으면) 표시가 사라진다.
                //
                // DIRECT·GROUP 공통으로 켠다. readPositions는 이제 상대별 초기값을
                // room.counterparts[].last_read_message_id로 seed하므로(useChatRoomLive 참고,
                // feature/be-chat-counterpart-read) 새로고침해도 이미 읽은 메시지가 다시
                // 안읽음으로 보이지 않는다.
                const notReadCount = room
                  ? allMemberIds.filter(
                      (id) => id !== message.sender_id && (readPositions.get(id) ?? 0) < message.message_id,
                    ).length
                  : 0
                const dayLabel = formatDayLabel(message.sent_at)
                const showDayDivider = dayLabel !== dayCursor
                if (showDayDivider) dayCursor = dayLabel

                return (
                  <Fragment key={message.message_id}>
                    {showDayDivider && (
                      <div className="mt-3.5 mb-2.5 flex items-center gap-3.5">
                        <div className="bg-line h-px flex-1" />
                        <span className="text-ink/[.58] text-[11.5px] font-semibold tracking-[0.04em]">
                          {dayLabel}
                        </span>
                        <div className="bg-line h-px flex-1" />
                      </div>
                    )}
                    {message.message_id === firstUnreadMessageId && (
                      <div ref={dividerRef} className="my-2 flex items-center gap-2">
                        <div className="bg-line h-px flex-1" />
                        <span className="text-danger text-xs font-semibold">새 메시지</span>
                        <div className="bg-line h-px flex-1" />
                      </div>
                    )}
                    <div className={`group flex items-end gap-1 py-[3px] ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {/* 안 읽은 사람 수 — 보낸 사람뿐 아니라 방에 있는 모두에게 똑같이 보인다.
                          말풍선 바깥, 화면 중앙 쪽에 둔다(내 메시지는 왼쪽, 받은 메시지는 오른쪽). */}
                      {isMine && notReadCount > 0 && (
                        <span className="text-ink-subtle mb-5 text-[10px]">{notReadCount}</span>
                      )}
                      {/* 메뉴 진입점. 시안은 우클릭만 두지만 그러면 **키보드만 쓰는 사용자는
                          자기 메시지를 지울 방법이 아예 없다**(말풍선은 button도 아니고
                          tabIndex도 없어 컨텍스트 메뉴 키도 닿지 않는다). 평소엔 보이지 않다가
                          마우스를 올리거나 Tab으로 포커스가 오면 나타난다. */}
                      {isMine && !message.is_deleted && (
                        <button
                          type="button"
                          aria-label="메시지 메뉴 열기"
                          aria-haspopup="menu"
                          aria-expanded={menu?.id === message.message_id}
                          onClick={(e) => openMessageMenuFromTrigger(e.currentTarget, message.message_id)}
                          className="text-ink/[.45] hover:text-ink mb-5 flex h-6 w-6 flex-none items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="5" cy="12" r="1.6" />
                            <circle cx="12" cy="12" r="1.6" />
                            <circle cx="19" cy="12" r="1.6" />
                          </svg>
                        </button>
                      )}
                      {/* 받은 메시지 — 카카오톡처럼 왼쪽에 둥근 프사 (행 상단 정렬) */}
                      {!isMine && (
                        <UserAvatar
                          user={{
                            nickname: senderById.get(message.sender_id)?.nickname,
                            profile_image_url: senderById.get(message.sender_id)?.profile_image_url,
                          }}
                          className="mr-1 h-9 w-9 self-start"
                        />
                      )}
                      <div className={`flex min-w-0 flex-col ${BUBBLE_CAP} ${isMine ? 'items-end' : 'items-start'}`}>
                        {/* 보낸 사람 이름 — 말풍선 안이 아니라 위에 (카카오톡 스타일).
                            1:1도 그룹방과 똑같이 띄운다(2026-08-07 결정). 전에는 "헤더에 상대가
                            이미 나와 있다"는 이유로 1:1에서 생략했는데, 방 종류에 따라 말풍선
                            구성이 달라지는 쪽이 더 어색하다는 판단. */}
                        {!isMine && (
                          <p className="text-ink/[.6] mb-1 text-[11.5px]">
                            {senderById.get(message.sender_id)?.nickname ??
                              (isResolvingRoom ? '' : '알 수 없음')}
                          </p>
                        )}
                        {message.is_deleted ? (
                          /* 시안 — 대시 테두리 + 이탤릭. 문구는 서버가 치환해 내려준 content 그대로. */
                          <div
                            className={[
                              BUBBLE_BASE,
                              'border-line-strong text-ink/[.54] rounded-[14px] border border-dashed bg-transparent text-sm italic',
                              isMine ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]',
                            ].join(' ')}
                          >
                            {message.content}
                          </div>
                        ) : (
                          <div
                            onContextMenu={isMine ? (e) => openMessageMenu(e, message.message_id) : undefined}
                            className={[
                              BUBBLE_BASE,
                              'text-ink rounded-[14px] border',
                              isMine
                                ? 'rounded-tr-[4px] border-[color-mix(in_srgb,var(--color-brand)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))]'
                                : 'bg-surface border-line rounded-tl-[4px] shadow-sm',
                            ].join(' ')}
                          >
                            {message.content}
                          </div>
                        )}
                        {/* 시안 — 시각은 말풍선 밖 아래 (mono 10.5) */}
                        <p className="text-ink/[.56] mt-[5px] text-[10.5px] tabular-nums">
                          {formatTimeLabel(message.sent_at)}
                        </p>
                      </div>
                      {!isMine && notReadCount > 0 && (
                        <span className="text-ink-subtle mb-5 text-[10px]">{notReadCount}</span>
                      )}
                    </div>
                  </Fragment>
                )
              })}

              {/* 에코로 아직 확정 안 된(또는 실패한) 내 메시지 — 항상 맨 뒤(최신)에 그린다. */}
              {pendingMessages.map((pending) => (
                <div key={pending.client_message_id} className="flex flex-col items-end gap-1 py-[3px]">
                  <div
                    className={`${BUBBLE_BASE} ${BUBBLE_CAP} text-ink rounded-[14px] rounded-tr-[4px] border border-[color-mix(in_srgb,var(--color-brand)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_14%,var(--color-surface))] opacity-60`}
                  >
                    {pending.content}
                  </div>
                  {pending.status === 'pending' && (
                    <span className="text-ink-subtle text-[10px]">전송 중...</span>
                  )}
                  {/* 전송 실패 — 카카오톡처럼 재전송(↻)·삭제(✕) 아이콘 두 개만 */}
                  {pending.status === 'failed' && (
                    <div role="group" aria-label="전송 실패" className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => retryMessage(pending.client_message_id)}
                        aria-label="재전송"
                        title="재전송"
                        className="bg-brand-hover flex h-6 w-6 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2.2" {...ICON_PROPS} aria-hidden>
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePendingMessage(pending.client_message_id)}
                        aria-label="보내지 못한 메시지 삭제"
                        title="삭제"
                        className="bg-brand-hover flex h-6 w-6 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2.2" {...ICON_PROPS} aria-hidden>
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 서버가 개인 에러 큐(/user/queue/errors)로 알려준 방금 요청의 실패 사유 —
          어느 pending 메시지 때문인지는 특정 못 해(payload에 상관관계 값이 없음) 특정
          말풍선이 아니라 입력창 위 공통 배너로 보여준다(useChatRoomLive 주석 참고). */}
      {errorMessage && (
        <div className="bg-danger flex items-center justify-between gap-2 px-4 py-2 text-sm text-white">
          <span>{errorMessage}</span>
          <button type="button" onClick={dismissError} className="text-xs whitespace-nowrap hover:underline">
            닫기
          </button>
        </div>
      )}

      {/* 입력줄 — 시안 inner max 760px, 입력창 44px, 전송 버튼 44×44 accent-600 */}
      <div className="border-line border-t">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex w-full max-w-[760px] items-end gap-2.5 px-4 pt-3 pb-3.5 md:px-5 md:pt-3.5 md:pb-4"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="메시지 입력"
            placeholder={
              socketStatus === 'connected' ? '메시지를 입력하세요' : '연결되면 메시지를 보낼 수 있어요'
            }
            disabled={socketStatus !== 'connected'}
            className="border-line-strong bg-surface text-ink focus:border-brand min-h-11 flex-1 rounded-[10px] border px-3 text-sm outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="전송"
            className="bg-brand-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.85" {...ICON_PROPS}>
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
              <path d="m21.854 2.147-10.94 10.939" />
            </svg>
          </button>
        </form>
      </div>

      {/* 내 메시지 우클릭 컨텍스트 메뉴 (시안) */}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="메시지 메뉴"
          className="border-line bg-surface hw-pop fixed z-[130] w-max rounded-[10px] border p-1.5 whitespace-nowrap shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setConfirmDeleteId(menu.id)
              setMenu(null)
            }}
            className="text-ink hover:bg-surface-muted flex min-h-10 w-full items-center gap-2.5 rounded-[6px] px-[11px] text-left text-[13.5px] transition-colors duration-100"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.75" {...ICON_PROPS} aria-hidden>
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            메시지 삭제
          </button>
        </div>
      )}

      {/* 삭제 확인 다이얼로그 — 제목·본문·버튼 문구 시안 그대로 */}
      {confirmDeleteId !== null && (
        <Modal
          onClose={() => setConfirmDeleteId(null)}
          label="대화 상대에게서 삭제"
          bare
          className="max-w-[420px] p-[26px]"
        >
          <h2 className="text-ink text-[19px] leading-[1.35] font-bold tracking-[-0.015em]">
            대화 상대에게서 삭제
          </h2>
          <p className="text-ink/[.78] mt-3 text-sm leading-[1.7] break-keep">
            선택한 메시지를 대화 상대의 채팅방 화면에서 삭제합니다. 메시지를 삭제하시겠습니까?
          </p>
          <div className="mt-[26px] flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="border-line-strong text-ink hover:bg-surface-muted min-h-[42px] rounded-[10px] border px-5 text-sm font-semibold"
            >
              아니오
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="bg-brand-subtle border-brand-hover text-brand-deep min-h-[42px] rounded-[10px] border px-6 text-sm font-semibold"
            >
              네
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

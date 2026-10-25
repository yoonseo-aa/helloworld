import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useChatRooms } from '../hooks'
import { formatRelativeTime, formatUnreadCount, roomDisplayName } from '../format'
import { useDebounce } from '@/hooks/useDebounce'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import UserAvatar from '@/components/UserAvatar'
import NewGroupModal from './NewGroupModal'

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function GroupAvatar({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${className} border-line bg-surface-muted text-ink/[.66] flex shrink-0 items-center justify-center rounded-full border`}
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

/**
 * 대화 목록 패널 — 시안 Chat.dc.html 좌측 패널과 1:1 (수치·문구 시안 기준).
 * keyword로 참여자 이름 검색(300ms 디바운스) + 20개 단위 무한 스크롤.
 */
export default function ChatRoomList({ onToast }: { onToast: (message: string) => void }) {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 300)
  const [isGroupModalOpen, setGroupModalOpen] = useState(false)

  const {
    data,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useChatRooms(debouncedKeyword)
  /**
   * 첫 페이지 행만 등장 연출 대상으로 표시한다(무한 스크롤로 올라온 다음 페이지는 제외).
   * 스크롤하다 20개가 한꺼번에 밀려들어오면 읽던 자리가 산만해지고, 이미 본 목록이
   * 다시 움직이는 것처럼 보인다. 알림 목록이 시간 창(1.5초)으로 막는 것과 같은 의도인데,
   * 여기서는 페이지 번호로 막는다 — 스크롤을 언제 하든 조건이 흔들리지 않는다.
   */
  const rooms =
    data?.pages.flatMap((page, pageIndex) =>
      page.rooms.map((room) => ({ room, isFirstPage: pageIndex === 0 })),
    ) ?? []
  // 개수가 많을수록 간격을 좁혀 등장이 총 0.6초 안에 끝나게 한다(알림 목록과 같은 계산).
  const stepMs = Math.max(24, Math.min(48, Math.round(600 / Math.max(1, rooms.length))))

  const bottomSentinelRef = useIntersectionObserver(() => fetchNextPage(), {
    enabled: !!hasNextPage && !isFetchingNextPage,
  })

  return (
    <div className="flex h-full flex-col">
      {/* 시안 헤더 — 제목·새 그룹 채팅 버튼 + 검색 (padding 18/18/14) */}
      <div className="border-line border-b px-[18px] pt-[18px] pb-3.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-ink text-[17px] font-bold tracking-[-0.01em]">최근 대화</h1>
          <button
            type="button"
            aria-label="새 그룹 채팅"
            onClick={() => setGroupModalOpen(true)}
            className="border-line text-ink/[.72] hover:bg-surface hover:text-ink ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border transition-colors"
          >
            {/* 시안 user-plus 아이콘 */}
            <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.75" {...ICON_PROPS}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="22" x2="16" y1="11" y2="11" />
            </svg>
          </button>
        </div>
        <div className="relative mt-3">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            strokeWidth="1.75"
            {...ICON_PROPS}
            className="text-ink/[.52] pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="대화 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름으로 대화 검색"
            className="border-line-strong bg-surface text-ink focus:border-brand min-h-10 w-full rounded-[10px] border pr-3 pl-9 text-[13.5px] outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        {isPending && <p className="text-ink-muted p-4 text-sm">불러오는 중...</p>}

        {!isPending && rooms.length === 0 && debouncedKeyword && (
          <p className="text-ink-muted p-4 text-sm">"{debouncedKeyword}" 검색 결과가 없어요.</p>
        )}

        {/* 시안 EmptyState — 링 아이콘 + 제목 19px + 본문 14px (문구 시안 그대로) */}
        {!isPending && rooms.length === 0 && !debouncedKeyword && (
          <div className="flex flex-col items-center px-5 pt-[76px] pb-10 text-center">
            <span className="border-line bg-surface text-ink/[.5] flex h-16 w-16 items-center justify-center rounded-full border">
              <svg width="26" height="26" viewBox="0 0 24 24" strokeWidth="1.5" {...ICON_PROPS}>
                <path d="M8 12h.01" />
                <path d="M12 12h.01" />
                <path d="M16 12h.01" />
                <path d="M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.1A7.6 7.6 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
              </svg>
            </span>
            <h2 className="text-ink mt-[22px] text-[19px] font-bold">아직 대화가 없어요</h2>
            <p className="text-ink/[.64] mt-[9px] max-w-[320px] text-sm leading-[1.7] break-keep">
              프로필에서 '메시지 보내기'를 누르면 여기에서 대화가 시작돼요.
            </p>
          </div>
        )}

        <div className="flex flex-col">
          {rooms.map(({ room, isFirstPage }, index) => {
            const partner = room.counterparts[0]
            const displayName = roomDisplayName(room)
            const isGroup = room.room_type === 'GROUP'
            const hasUnread = room.unread_count > 0
            return (
              <NavLink
                key={room.room_id}
                to={`/chat/${room.room_id}`}
                // key가 room_id라 새 메시지로 순서가 바뀌어도 DOM은 재사용된다 —
                // 연출은 처음 마운트될 때 한 번만 돌고, 목록이 재정렬될 때 다시 돌지 않는다.
                style={isFirstPage ? { animationDelay: `${index * stepMs}ms` } : undefined}
                className={({ isActive }) =>
                  [
                    'border-line flex items-center gap-3 border-b px-[18px] py-[13px] transition-colors',
                    // 선택된 방 — 브랜드색을 **투명 위에** 얹어 밑에 깔린 표면을 따라가게 한다
                    // (알림 미읽음 행과 같은 방식). 예전엔 color-mix의 바탕이 #eeeff2로
                    // 박혀 있었는데, 그게 라이트 모드 surface-sunken 값이라 다크 모드에서도
                    // 밝은 회색이 나와 선택한 행만 훤해졌다.
                    isActive
                      ? 'bg-brand/[9%] shadow-[inset_3px_0_0_var(--color-brand-hover)]'
                      : 'hover:bg-surface',
                    isFirstPage ? 'hw-lrow' : '',
                  ].join(' ')
                }
              >
                {isGroup ? (
                  <GroupAvatar />
                ) : (
                  <UserAvatar
                    user={{ nickname: partner?.nickname, profile_image_url: partner?.profile_image_url }}
                    className="h-10 w-10"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="text-ink truncate text-sm font-semibold">{displayName}</p>
                    {isGroup && (
                      <span className="border-line text-ink/[.58] shrink-0 rounded-[3px] border px-[5px] py-px text-[10px] tracking-[0.04em] tabular-nums">
                        {room.counterparts.length + 1}명
                      </span>
                    )}
                    {room.last_message && (
                      <span className="text-ink/[.56] ml-auto shrink-0 text-[10.5px] tabular-nums">
                        {formatRelativeTime(room.last_message.sent_at)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p
                      className={[
                        'min-w-0 flex-1 truncate text-[13px] leading-normal',
                        hasUnread ? 'text-ink/[.92] font-semibold' : 'text-ink/[.64]',
                      ].join(' ')}
                    >
                      {room.last_message?.content ?? '아직 메시지가 없어요'}
                    </p>
                    {hasUnread && (
                      <span
                        aria-label={`읽지 않은 메시지 ${room.unread_count}건`}
                        className="bg-brand-hover font-mono shrink-0 rounded-full px-[7px] py-1 text-[10.5px] leading-none text-white tabular-nums"
                      >
                        {formatUnreadCount(room.unread_count)}
                      </span>
                    )}
                  </div>
                </div>
              </NavLink>
            )
          })}
        </div>

        {hasNextPage && <div ref={bottomSentinelRef} className="h-1" />}
        {isFetchingNextPage && (
          <p className="text-ink-muted py-2 text-center text-xs">더 불러오는 중...</p>
        )}
      </div>

      {isGroupModalOpen && (
        <NewGroupModal
          onClose={() => setGroupModalOpen(false)}
          // 시안 문구는 "그룹 채팅을 만들었어요 — N명 초대"인데, 이 모달은 1명만 고르면
          // 1:1(DIRECT)로 동작해 그대로 쓸 수 없다. 인원으로 문장을 가르는 대신 두 경우를
          // 다 덮는 "대화가 시작되었어요"에 시안의 인원 꼬리를 붙여 한 문장으로 쓴다.
          onCreated={(memberCount) => onToast(`대화가 시작되었어요 — ${memberCount}명 초대`)}
        />
      )}
    </div>
  )
}

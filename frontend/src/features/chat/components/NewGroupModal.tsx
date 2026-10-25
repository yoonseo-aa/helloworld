import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import { useAuthStore } from '@/stores/useAuthStore'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useFollowingList } from '@/features/profile/hooks'
import { useCreateChatRoom } from '../hooks'

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/**
 * 새 그룹 채팅 모달 — 시안 Chat.dc.html의 gOpen 모달(handoff NewGroupModal)과 1:1.
 * 팔로우한 개발자만 초대할 수 있다. 1명이면 1:1 대화(DIRECT), 2명 이상이면 그룹 —
 * 백엔드가 target_user_ids 원소 수로 가르므로 요청은 하나다(CreateChatRoomRequest).
 *
 * 시안과 다른 점 (팀 결정·백엔드 계약):
 * - 그룹 이름 입력이 없다 — POST /api/chat/rooms 요청이 target_user_ids뿐이라
 *   이름을 보낼 수 없다(CreateChatRoomRequest). 백엔드에 name 필드가 생기면 추가한다.
 * - 시안의 "2명 이상"·"최대 20명" 제한을 두지 않는다 — 1명 선택은 1:1로 동작하고,
 *   인원 상한은 백엔드 정책이 확정되면 그때 맞춘다(2026-08-05 결정).
 * - 시안의 @handle 표기는 nickname으로 대신한다 — 백엔드에 핸들 개념이 없다.
 *
 * 검색은 서버 API가 아니라, 이미 불러온(무한 스크롤로 로드된) 팔로잉 페이지들을
 * 클라이언트에서 닉네임으로 필터링한다 — 아직 안 불러온 뒤쪽 페이지는 검색에 안 잡힌다.
 */
export default function NewGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  /** 방 생성 성공 직후(이동 전) 호출 — 호출부가 토스트 등 후처리를 단다. */
  /** 생성 성공 알림 — 초대한 인원 수를 넘긴다(시안 토스트 문구가 인원을 쓴다). */
  onCreated?: (memberCount: number) => void
}) {
  const myUserId = useAuthStore((state) => state.userId)
  const navigate = useNavigate()

  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useFollowingList(myUserId ?? undefined)
  const allUsers = useMemo(() => data?.pages.flatMap((page) => page.content) ?? [], [data])

  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim().toLowerCase()
  const users = trimmedQuery
    ? allUsers.filter((user) => (user.nickname ?? '').toLowerCase().includes(trimmedQuery))
    : allUsers
  const isSearchEmpty = trimmedQuery.length > 0 && users.length === 0

  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

  const [selected, setSelected] = useState<number[]>([])
  const selectedUsers = selected
    .map((id) => allUsers.find((user) => user.user_id === id))
    .filter((user) => user !== undefined)
  const canCreate = selected.length >= 1
  const { mutate: createRoom, isPending: isCreating } = useCreateChatRoom()
  const [errorMessage, setErrorMessage] = useState('')

  function toggle(userId: number) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : prev.concat(userId),
    )
  }

  function handleCreate() {
    if (!canCreate || isCreating) return
    setErrorMessage('')
    createRoom(selected, {
      onSuccess: (room) => {
        onCreated?.(selected.length)
        onClose()
        navigate(`/chat/${room.room_id}`)
      },
      onError: () => setErrorMessage('대화를 시작하지 못했습니다.'),
    })
  }

  return (
    <Modal
      onClose={onClose}
      label="새 그룹 채팅"
      bare
      className="flex max-h-[min(680px,88vh)] max-w-[520px] flex-col overflow-hidden"
    >
      {/* 헤더 — 제목·설명 + 닫기 (시안 padding 16/12/15/22) */}
      <div className="border-line flex flex-none items-center gap-3.5 border-b pt-4 pr-3 pb-[15px] pl-[22px]">
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-lg font-bold tracking-[-0.02em]">새 그룹 채팅</h2>
          <p className="text-ink/[.58] mt-[5px] text-[12.5px] leading-normal break-keep">
            팔로우한 개발자만 초대할 수 있어요. 선택하면 대화가 시작돼요.
          </p>
        </div>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="border-line text-ink hover:bg-surface-muted flex h-11 w-11 flex-none items-center justify-center rounded-[6px] border transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.9" {...ICON_PROPS} aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* 본문 — 초대할 사람 카운트·선택 칩·검색·팔로잉 목록 (시안 padding 16/22/18) */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] px-[22px] pt-4 pb-[18px]">
        <div className="mb-[9px] flex items-baseline gap-[9px]">
          <span className="text-ink text-[13px] font-semibold tracking-[-0.01em]">초대할 사람</span>
          <span className="text-ink/[.55] text-[11px] tabular-nums">
            {selected.length}명
          </span>
        </div>

        {selectedUsers.length > 0 && (
          <div className="mb-[11px] flex flex-wrap gap-[7px]">
            {selectedUsers.map((user) => (
              <span
                key={user.user_id}
                className="border-brand-hover bg-brand/[.08] text-ink inline-flex items-center gap-[7px] rounded-full border py-[5px] pr-[7px] pl-[5px] text-[12.5px]"
              >
                <UserAvatar user={user} className="h-[22px] w-[22px]" />
                {user.nickname ?? '닉네임 미설정'}
                <button
                  type="button"
                  aria-label={`${user.nickname ?? '닉네임 미설정'} 선택 해제`}
                  onClick={() => toggle(user.user_id)}
                  className="text-brand-deep flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" strokeWidth="2.4" {...ICON_PROPS} aria-hidden>
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative mb-2.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            strokeWidth="1.75"
            {...ICON_PROPS}
            aria-hidden
            className="text-ink/[.52] pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            aria-label="팔로우 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름으로 검색"
            className="border-line-strong bg-surface text-ink min-h-10 w-full rounded-[10px] border pr-3 pl-9 text-[13.5px] outline-none focus:border-brand"
          />
        </div>

        <div role="group" aria-label="팔로우한 개발자" className="flex flex-col gap-0.5">
          {isPending && <p className="text-ink-muted p-2 text-sm">불러오는 중...</p>}

          {!isPending && allUsers.length === 0 && (
            <p className="text-ink-muted p-2 text-sm">아직 팔로우한 사용자가 없어요.</p>
          )}

          {users.map((user) => {
            const isSelected = selected.includes(user.user_id)
            return (
              <button
                key={user.user_id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${user.nickname ?? '닉네임 미설정'} ${isSelected ? '선택 해제' : '선택'}`}
                onClick={() => toggle(user.user_id)}
                className={[
                  'flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                  isSelected ? 'border-brand-hover bg-brand/[.09]' : 'border-transparent hover:bg-surface-muted',
                ].join(' ')}
              >
                <UserAvatar user={user} className="h-[38px] w-[38px]" />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-ink truncate text-[13.5px] font-semibold">
                    {user.nickname ?? '닉네임 미설정'}
                  </span>
                  {user.introduce && (
                    <span className="text-ink/[.6] truncate text-xs">{user.introduce}</span>
                  )}
                </span>
                <span
                  aria-hidden
                  className={[
                    'flex h-5 w-5 flex-none items-center justify-center rounded-full border text-white',
                    isSelected ? 'border-brand-hover bg-brand-hover' : 'border-line-strong',
                  ].join(' ')}
                >
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="3" {...ICON_PROPS} aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}

          {hasNextPage && <div ref={sentinelRef} className="h-1" />}
          {isFetchingNextPage && (
            <p className="text-ink-muted py-2 text-center text-xs">불러오는 중...</p>
          )}
        </div>

        {isSearchEmpty && (
          <div className="flex flex-col items-center px-4 pt-[30px] pb-2.5 text-center">
            <span className="border-line bg-surface text-ink/[.5] flex h-12 w-12 items-center justify-center rounded-full border">
              <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.6" {...ICON_PROPS} aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <p className="text-ink/[.62] mt-3.5 text-[13.5px] leading-[1.7] break-keep">
              팔로우한 개발자 중에 일치하는 사람이 없어요.
              <br />
              먼저 팔로우하면 초대할 수 있어요.
            </p>
          </div>
        )}

        {errorMessage && <p className="text-danger mt-2 text-sm">{errorMessage}</p>}
      </div>

      {/* 푸터 — 취소 · 그룹 만들기 (시안: accent-100 배경 + accent-600 테두리 + accent-800 글자) */}
      <div className="border-line bg-surface-muted flex flex-none items-center justify-end gap-2.5 border-t px-[22px] py-[13px]">
        <button
          type="button"
          onClick={onClose}
          className="text-brand hover:bg-brand/[.1] min-h-[42px] rounded-[10px] px-4 text-[13.5px] font-semibold"
        >
          취소
        </button>
        <button
          type="button"
          disabled={!canCreate || isCreating}
          onClick={handleCreate}
          className={[
            'min-h-[42px] rounded-[10px] border px-[22px] text-sm font-semibold transition-colors',
            canCreate
              ? 'bg-brand-subtle border-brand-hover text-brand-deep'
              : 'bg-surface-muted border-line text-ink/[.38] cursor-not-allowed',
          ].join(' ')}
        >
          대화 시작하기
        </button>
      </div>
    </Modal>
  )
}

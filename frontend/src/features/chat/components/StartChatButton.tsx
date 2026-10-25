import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateChatRoom } from '../hooks'

/**
 * 프로필 페이지의 "메시지 보내기" — 검색 없이 이미 알고 있는 상대 user_id로 바로
 * 채팅방을 생성/재사용(POST /api/chat/rooms)하고 그 방으로 이동한다.
 */
/**
 * `hero`는 프로필 헤더의 팔로우/메시지 2열 그리드용 — 명세 2절대로 셀을 가득 채우고
 * min-height 46, 팔로우 버튼과 같은 활자(700 / 14.5)로 나란히 선다.
 */
const VARIANT = {
  hero: 'flex w-full min-h-[46px] items-center justify-center rounded-md border border-line bg-ink/[.04] px-[18px] text-[14.5px] font-bold tracking-[-0.01em] text-ink transition-colors hover:border-brand hover:text-brand-strong disabled:opacity-50',
  compact:
    'border-brand text-brand hover:bg-brand-subtle rounded-lg border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-50',
} as const

export default function StartChatButton({
  userId,
  variant = 'compact',
}: {
  userId: number
  variant?: keyof typeof VARIANT
}) {
  const navigate = useNavigate()
  const { mutate: createRoom, isPending } = useCreateChatRoom()
  const [errorMessage, setErrorMessage] = useState('')

  function handleClick() {
    setErrorMessage('')
    createRoom([userId], {
      onSuccess: (room) => navigate(`/chat/${room.room_id}`),
      onError: () => setErrorMessage('채팅방을 시작하지 못했습니다.'),
    })
  }

  return (
    <div
      className={
        variant === 'hero' ? 'flex w-full flex-col gap-1' : 'flex flex-col items-end gap-1'
      }
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={VARIANT[variant]}
      >
        메시지 보내기
      </button>
      {errorMessage && <p className="text-danger text-xs">{errorMessage}</p>}
    </div>
  )
}

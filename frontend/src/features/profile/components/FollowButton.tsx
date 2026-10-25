import { useState } from 'react'
import { useFollowStatus, useToggleFollow } from '../hooks'

/**
 * 팔로우/언팔로우 토글 버튼.
 *
 * initialIsFollowing: 호출하는 쪽이 실제 팔로우 여부를 이미 알면(FollowListModal —
 * 목록 항목에 is_following이 같이 온다) 넘긴다. 그러면 이 버튼은 따로 조회하지 않는다.
 * 안 넘기면(ProfilePage) GET /api/users/{id}/follow(팔로우 상태 단건 조회)를 직접
 * 불러서 초기 상태를 채운다 — 목록처럼 항목마다 있는 게 아니라 프로필 페이지에
 * 버튼이 하나뿐이라 이 정도 조회는 괜찮다.
 *
 * 표시 상태는 **서버 값이 정본**이고, 로컬 state는 응답이 올 때까지만 덮어쓰는
 * 낙관적 오버레이다(누르는 즉시 반응하되, 결과가 오면 비켜준다).
 *
 * 예전엔 서버 상태를 최초 1회만 로컬 state에 복사하고 그 뒤로는 로컬만 믿었는데,
 * 그러면 같은 사용자에 대한 버튼이 두 곳(프로필 페이지 + 팔로워 목록 모달)에 있을 때
 * 한쪽에서 토글해도 다른 쪽은 옛 상태로 남았다. 그 상태에서 누르면 이미 팔로우 중인
 * 관계에 또 팔로우를 보내게 되고, 서버는 멱등 처리로 같은 수를 돌려주므로 화면상
 * "눌렀는데 숫자가 안 변한다"가 된다 — 간헐적으로 재현되던 그 증상의 원인.
 * 이제 토글 성공 시 useToggleFollow가 상태를 쿼리 캐시에 써두고, 그 캐시를 구독하는
 * 모든 버튼이 같은 값을 본다(목록 항목의 버튼은 조회를 안 해도 캐시 갱신은 받는다).
 */
/**
 * 크기 두 갈래.
 *  - `hero`   프로필 헤더의 팔로우/메시지 2열 그리드 (명세 2절: min-height 46, 셀 가득)
 *  - `compact` 팔로워/팔로잉 목록의 행 끝 버튼 (명세 PeopleModal: min-height 34)
 */
const VARIANT = {
  hero: {
    base: 'flex w-full min-h-[46px] items-center justify-center rounded-md border px-[18px] text-[14.5px] font-bold tracking-[-0.01em] transition-colors disabled:opacity-50',
    on: 'border-line bg-transparent text-ink/70 hover:border-line-strong hover:bg-ink/[.09] hover:text-ink',
    off: 'border-brand bg-brand text-white hover:border-brand-hover hover:bg-brand-hover',
  },
  compact: {
    base: 'flex-none rounded-md border px-3.5 min-h-[34px] text-[13px] font-semibold transition-colors disabled:opacity-50',
    on: 'border-line bg-transparent text-ink/[.58] hover:text-ink',
    off: 'border-brand bg-transparent text-brand-strong hover:bg-brand-subtle',
  },
} as const

function FollowButton({
  userId,
  initialIsFollowing,
  variant = 'compact',
}: {
  userId: number
  initialIsFollowing?: boolean
  variant?: keyof typeof VARIANT
}) {
  const shouldFetchStatus = initialIsFollowing === undefined
  const { data: status } = useFollowStatus(userId, shouldFetchStatus)
  const { mutate, isPending } = useToggleFollow(userId)

  // null이면 "서버 값을 그대로 보여준다". 클릭하는 순간에만 값이 들어갔다가 응답과 함께 비워진다.
  const [optimisticIsFollowing, setOptimisticIsFollowing] = useState<boolean | null>(null)
  const isFollowing =
    optimisticIsFollowing ?? status?.is_following ?? initialIsFollowing ?? false

  function handleClick() {
    setOptimisticIsFollowing(!isFollowing)
    // 성공이든 실패든 오버레이를 걷어낸다 — 성공이면 캐시에 들어온 서버 확정값이,
    // 실패면 원래 서버 값이 드러나므로 별도 롤백 처리가 필요 없다.
    mutate(!isFollowing, { onSettled: () => setOptimisticIsFollowing(null) })
  }

  const style = VARIANT[variant]

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isFollowing}
      className={`${style.base} ${isFollowing ? style.on : style.off} whitespace-nowrap`}
    >
      {/* 라벨은 시안 표기를 따른다 — 누르는 동작('언팔로우')이 아니라 현재 상태('팔로잉'). */}
      {isFollowing ? '팔로잉' : '팔로우'}
    </button>
  )
}

export default FollowButton

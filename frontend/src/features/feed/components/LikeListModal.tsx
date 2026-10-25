import { getErrorMessage } from '@/api/errors'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { usePostLikes } from '../hooks'

/** 좋아요 누른 사용자 목록 모달 — 20명씩 무한 스크롤. */
export default function LikeListModal({
  postId,
  onClose,
}: {
  postId: number
  onClose: () => void
}) {
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePostLikes(postId)
  const users = data?.pages.flatMap((page) => page.users) ?? []
  // isError를 빼야 한다 — 실패 후 enabled가 다시 켜지면 옵저버가 새로 만들어지며
  // 뷰포트 안 센티널에 즉시 발화해 재요청 루프가 된다.
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage && !isError,
  })

  return (
    <Modal onClose={onClose} label="좋아요" className="max-h-[70vh] max-w-sm overflow-y-auto [scrollbar-gutter:stable]">
      <p className="text-ink font-semibold">좋아요</p>
      {/* 이미 받은 목록이 있으면 실패해도 지우지 않는다(FeedList와 같은 규칙). */}
      {isPending ? (
        <p className="text-ink-subtle py-8 text-center text-sm">불러오는 중...</p>
      ) : isError && users.length === 0 ? (
        <p className="text-danger py-8 text-center text-sm">
          {getErrorMessage(error, '좋아요 목록을 불러오지 못했습니다.')}
        </p>
      ) : users.length === 0 ? (
        <p className="text-ink-subtle py-8 text-center text-sm">
          아직 좋아요가 없어요.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {users.map((user) => (
            <li key={user.user_id} className="flex items-center gap-3">
              <UserAvatar user={user} />
              <span className="text-ink min-w-0 truncate text-sm font-medium">
                {user.nickname}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <p className="text-ink-subtle py-3 text-center text-sm">더 불러오는 중...</p>
      )}
      {isError && users.length > 0 && (
        <div className="py-3 text-center">
          <p className="text-danger text-[13px]">
            {getErrorMessage(error, '더 불러오지 못했습니다.')}
          </p>
          <button
            type="button"
            onClick={() => (hasNextPage ? fetchNextPage() : refetch())}
            className="border-line hover:bg-surface-muted mt-2 rounded-lg border px-3 py-1.5 text-[13px]"
          >
            다시 시도
          </button>
        </div>
      )}
    </Modal>
  )
}

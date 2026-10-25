import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Modal from '@/components/Modal'
import { useAuthStore } from '@/stores/useAuthStore'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import {
  useFollowerCount,
  useFollowerList,
  useFollowingCount,
  useFollowingList,
} from '../hooks'
import FollowButton from './FollowButton'

/**
 * 팔로워/팔로잉 목록 모달. 생김새는 시안 PeopleModal 그대로다 —
 * 밑줄 탭 · 닫기 X · 40px 아바타 행 · 행 끝 팔로우 토글.
 *
 * 라우트로 열린다(`/users/:userId/followers`) — ProfilePage가 마운트된 채로 그 위에 얹힌다.
 * 시안은 부모의 useState로 여닫지만 우리는 자식 라우트를 유지한다: URL이 바뀌므로
 * 뒤로가기로 닫히고, 링크 공유·새로고침도 동작한다.
 * ESC·외부 클릭 닫기·포커스 트랩은 공통 Modal이 처리한다.
 *
 * 명세: 탭 전환 · 20명씩 무한 스크롤 · ESC/외부 클릭 닫기
 *       빈 상태 "아직 팔로워가 없어요" / "아직 팔로우한 사용자가 없어요"
 *
 * **높이는 인원수와 무관하게 고정한다**(LIST_HEIGHT = 5행). 예전에는 목록 길이에 맞춰
 * 늘어나서, 팔로워 2명·팔로잉 30명이면 탭을 누를 때마다 모달이 통째로 커졌다 줄었다 하며
 * 방금 누른 탭이 커서 아래에서 도망갔다. 5명이 들어가는 상자를 처음부터 띄우고 그 뒤로는
 * 안에서만 스크롤한다 — 탭을 오가도 상자 크기가 그대로다.
 */

/** 행 하나의 높이(py-3 12+12 · 아바타 40 · 하단 헤어라인 1). 아래 LIST_HEIGHT 계산의 근거. */
const ROW_HEIGHT = 65
/**
 * 목록 영역 높이 = 5행 + 목록 위아래 여백(pt-1.5 6 · pb-4 16).
 * 여백까지 넣어야 딱 5명일 때 스크롤바가 안 생기고, 6명째부터 아래에 살짝 걸쳐 보이며
 * "더 있다"를 알린다.
 */
const LIST_HEIGHT = ROW_HEIGHT * 5 + 6 + 16
/** 탭 헤더 + 구분선 높이(pt-3.5 14 · 닫기 버튼 44+5 · 헤어라인 1). 화면이 낮을 때 뺄 몫. */
const HEADER_HEIGHT = 64

/** 밑줄 탭 (시안 PeopleModal `tab()`). 밑줄은 아래 슬라이딩 막대가 따로 그린다. */
function tabClass(on: boolean) {
  return [
    // 투명 테두리를 남겨 둔다 — 막대가 절대 배치로 빠져도 탭 높이가 전과 같아야
    // 헤더 구분선과의 간격이 안 밀린다 (피드 탭과 같은 방식).
    'min-h-10 border-b-2 border-transparent px-0.5 pb-[11px] text-[14px] font-semibold tabular-nums transition-colors',
    on ? 'text-ink' : 'text-ink/50 hover:text-ink',
  ].join(' ')
}

export default function FollowListModal({ tab }: { tab: 'followers' | 'following' }) {
  const { userId: rawUserId } = useParams()
  const myUserId = useAuthStore((state) => state.userId)
  const userId = rawUserId === 'me' ? (myUserId ?? undefined) : Number(rawUserId)
  const navigate = useNavigate()

  const close = () => navigate(`/users/${rawUserId}`, { replace: true })
  const title = tab === 'followers' ? '팔로워' : '팔로잉'

  const { data: followerCount } = useFollowerCount(userId)
  const { data: followingCount } = useFollowingCount(userId)

  const followingQuery = useFollowingList(tab === 'following' ? userId : undefined)
  const followerQuery = useFollowerList(tab === 'followers' ? userId : undefined)
  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    tab === 'following' ? followingQuery : followerQuery

  const users = data?.pages.flatMap((page) => page.content) ?? []

  // 목록 맨 아래 sentinel이 보이면 다음 페이지를 부른다.
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

  const activeIndex = tab === 'followers' ? 0 : 1
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([])
  /**
   * 활성 탭 밑줄의 위치·너비. 탭 라벨에 인원수가 붙어("팔로워 1,204") 폭이 제각각이고
   * 그 수가 나중에 도착하며 폭이 또 바뀌므로, CSS로는 못 구하고 실제 링크를 재야 한다 —
   * 피드·좋아요 탭 밑줄과 같은 방식. null이면 아직 측정 전(막대를 그리지 않는다).
   */
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null)
  // 활성 탭이 바뀌면 다시 잰다. ResizeObserver는 인원수가 도착해 라벨 폭이 늘 때용.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIndex]
      if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of tabRefs.current) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [activeIndex])

  return (
    <Modal
      onClose={close}
      label={`${title} 목록`}
      bare
      className="flex max-w-[440px] flex-col overflow-hidden"
    >
      <div className="flex flex-none items-center justify-between gap-3 pt-3.5 pr-2 pl-5">
        <div className="relative flex items-center gap-5">
          <Link
            to={`/users/${rawUserId}/followers`}
            replace
            ref={(el) => {
              tabRefs.current[0] = el
            }}
            className={tabClass(tab === 'followers')}
          >
            팔로워 {(followerCount ?? 0).toLocaleString()}
          </Link>
          <Link
            to={`/users/${rawUserId}/following`}
            replace
            ref={(el) => {
              tabRefs.current[1] = el
            }}
            className={tabClass(tab === 'following')}
          >
            팔로잉 {(followingCount ?? 0).toLocaleString()}
          </Link>
          {/* 미끄러지는 밑줄 — 활성 탭에 선을 칠하면 누를 때마다 순간이동한다.
              left가 아니라 transform으로 옮긴다(레이아웃 재계산 없이 합성만 하므로 매끄럽다).
              측정 전에는 opacity 0이라 0px 막대가 안 보인다. */}
          <span
            aria-hidden
            className="bg-brand absolute bottom-0 left-0 h-[2px] rounded-full transition-[transform,width,opacity] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
            style={{
              width: underline?.width ?? 0,
              opacity: underline ? 1 : 0,
              transform: `translateX(${underline?.left ?? 0}px)`,
            }}
          />
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="닫기"
          className="text-ink/55 hover:text-ink mb-[5px] flex h-11 w-11 flex-none items-center justify-center rounded-md transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className="bg-line h-px" />

      {/* 높이 고정 — 인원수가 몇이든 5행짜리 상자다. 화면이 낮으면 그만큼만 줄인다.
          flex-col + 행 flex-none: 행이 눌려 찌그러지지 않게(스크롤 컨테이너의 기본 축소 방지),
          그리고 빈 상태 문구를 m-auto 하나로 가운데 세우려고. */}
      <div
        className="flex flex-none flex-col overflow-y-auto [scrollbar-gutter:stable] px-5 pt-1.5 pb-4"
        style={{ height: `clamp(120px, calc(84vh - ${HEADER_HEIGHT}px), ${LIST_HEIGHT}px)` }}
      >
        {isPending && <p className="text-ink-muted m-auto text-sm">불러오는 중...</p>}

        {!isPending && users.length === 0 && (
          <p className="text-ink-muted m-auto text-sm">
            {tab === 'followers' ? '아직 팔로워가 없어요' : '아직 팔로우한 사용자가 없어요'}
          </p>
        )}

        {users.map((user) => (
          <div
            key={user.user_id}
            className="border-line flex flex-none items-center gap-3 border-b py-3"
          >
            <Link to={`/users/${user.user_id}`} onClick={close} className="flex-none">
              {user.profile_image_url ? (
                <img
                  src={user.profile_image_url}
                  alt={user.nickname ?? '프로필 이미지'}
                  className="border-line h-10 w-10 rounded-full border object-cover"
                />
              ) : (
                <div className="border-line bg-surface-sunken text-ink flex h-10 w-10 items-center justify-center rounded-full border text-[17px] font-semibold">
                  {(user.nickname ?? '?').charAt(0)}
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to={`/users/${user.user_id}`}
                onClick={close}
                className="text-ink block truncate text-[14px] font-semibold hover:underline"
              >
                {user.nickname ?? '닉네임 미설정'}
              </Link>
              {user.introduce && (
                <p className="text-ink/[.58] mt-0.5 truncate text-[12.5px] break-keep">
                  {user.introduce}
                </p>
              )}
            </div>
            {myUserId !== user.user_id && (
              <FollowButton userId={user.user_id} initialIsFollowing={user.is_following} />
            )}
          </div>
        ))}

        {/* 무한 스크롤 트리거. 눈에 안 보여도 되고, 다음 페이지 있을 때만 관찰 대상으로 둔다. */}
        {hasNextPage && <div ref={sentinelRef} className="h-1 flex-none" />}
        {isFetchingNextPage && (
          <p className="text-ink-muted flex-none py-2 text-center text-sm">불러오는 중...</p>
        )}
      </div>
    </Modal>
  )
}

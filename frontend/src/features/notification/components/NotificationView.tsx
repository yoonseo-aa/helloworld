import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/api/errors'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useBadgeStore } from '@/stores/useBadgeStore'
import {
  resyncNotificationBadge,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks'
import NotificationList from './NotificationList'
import type { NotificationFilter, NotificationItem } from '../types'

/**
 * 알림 화면 — /notifications (시안 pages/NotificationsPage.tsx 이식).
 *
 * 필터는 URL이 아니라 컴포넌트 상태로 둔다. 검색과 달리 공유·뒤로가기로 되돌아올 만한
 * 상태가 아니고(내 알림 목록), 서버도 엔드포인트를 나누지 않고 unread_only 하나로 받는다.
 */
const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'UNREAD', label: '읽지 않음' },
]

export default function NotificationView() {
  const [filter, setFilter] = useState<NotificationFilter>('ALL')


  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(filter)
  /**
   * 안 읽은 건수는 레일 뱃지와 같은 값을 봐야 한다 — 화면과 뱃지가 따로 세면 어긋난다.
   * 그래서 여기서 따로 조회하지 않고 뱃지 스토어(push·읽음 처리가 갱신)를 그대로 읽는다.
   */
  const unreadCount = useBadgeStore((state) => state.notificationUnreadCount)
  const markRead = useMarkNotificationRead()

  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

  /**
   * 첫 진입 1.5초 동안만 행 등장 모션을 켠다. 그 뒤(필터 전환·다음 페이지)엔 꺼서
   * 이미 보고 있던 목록이 다시 흔들리지 않게 한다. 감속 모션 설정이면 아예 켜지 않는다.
   */
  const [intro, setIntro] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (!intro) return
    const timer = setTimeout(() => setIntro(false), 1500)
    return () => clearTimeout(timer)
  }, [intro])

  // 화면에 들어올 때 한 번 서버 값으로 맞춘다 — 로그인 seed 이후 다른 기기에서 읽었거나
  // 연결이 끊겨 있던 동안의 push를 놓쳤을 수 있다.
  useEffect(() => {
    resyncNotificationBadge()
  }, [])

  const items = data?.pages.flatMap((page) => page.items) ?? []

  /**
   * 알림 클릭 — 읽음 처리만 한다(낙관 반영이라 행이 곧바로 흰색으로 바뀐다).
   *
   * 이동시키지 않는 이유: 알림을 훑는 동작과 게시물을 여는 동작은 목적이 다르다.
   * 클릭이 곧 이동이면 여러 건을 확인하려던 사용자가 매번 목록 밖으로 튕겨 나가고,
   * 돌아왔을 때 스크롤 위치와 등장 모션이 초기화된다. 읽음만 남기면 목록에 머무른 채
   * 위에서 아래로 훑을 수 있다. 이미 읽은 행은 눌러도 아무 일이 없다.
   */
  const handleSelect = (item: NotificationItem) => {
    if (!item.is_read) markRead.mutate(item.notification_id)
  }


  return (
    <div className="mx-auto w-full max-w-[680px] px-4 pt-[22px] pb-28 md:px-8 md:pt-[30px] md:pb-24">
      {/* 헤더 — 제목 + 안 읽은 건수 요약 + 모두 읽음 */}
      <div className="flex flex-wrap items-end gap-3.5 pb-[18px]">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">알림</h1>
          <p className="text-ink-muted mt-[7px] text-[13.5px]">
            {unreadCount > 0
              ? `읽지 않은 알림 ${unreadCount}건`
              : '모두 확인했어요'}
          </p>
        </div>
        {/* 시안에는 여기 '모두 읽음 표시' 버튼이 있다. 서버에 일괄 처리 엔드포인트가 없어
            버튼 하나가 요청 수백 개로 번지는 구조가 돼서 이번 범위에서는 넣지 않았다
            (features/notification/hooks.ts 주석 참고). read-all이 생기면 같이 붙인다. */}
      </div>

      {/* 필터 — 서버의 unread_only 파라미터와 1:1.
          컨테이너 폭 206px = 시안 버튼 96 x 2 + 버튼 사이 간격 6 + 안쪽 여백 4 x 2.
          폭을 고정하고 버튼을 flex-1로 두면 두 버튼이 항상 정확히 같은 폭이 된다 —
          글꼴이 바뀌어도 어긋나지 않아야 아래 판의 calc이 성립한다. */}
      <div className="border-line border-b pb-5">
        <div
          role="group"
          aria-label="알림 필터"
          className="border-line bg-surface relative flex w-[206px] gap-1.5 rounded-[10px] border p-1"
        >
          {/*
            활성 표시를 버튼에 칠하면 누를 때마다 색이 순간이동한다. 대신 **하나의 판**이
            누른 쪽으로 미끄러진다 — 게시물 작성 모달의 종류 선택과 같은 연출·같은 구현이다.
            두 버튼이 같은 폭(96px)이라 위치를 잴 필요 없이 CSS만으로 표현된다:
            폭 calc(50% - 7px)는 안쪽 여백 4+4와 버튼 사이 간격 6을 뺀 버튼 하나의 폭,
            이동 거리 calc(100% + 6px)는 자기 폭 + 간격.
          */}
          <span
            aria-hidden
            style={{
              transform:
                filter === 'UNREAD' ? 'translateX(calc(100% + 6px))' : 'none',
            }}
            className="border-brand bg-brand/[8%] pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-7px)] rounded-[6px] border transition-transform duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
          />
          {FILTERS.map(({ value, label }) => {
            const active = filter === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(value)}
                className={[
                  // 크기는 시안 그대로 — 높이 38, 폭은 flex-1로 96px씩 나눠 갖는다.
                  // 투명 테두리를 남겨 두는 이유: 테두리는 판이 그리지만 버튼에서 빼면
                  // 폭이 2px 줄어 판과 어긋난다.
                  'relative z-10 min-h-[38px] flex-1 rounded-[6px] border border-transparent text-[13.5px] font-semibold whitespace-nowrap transition-colors',
                  active ? 'text-brand-strong' : 'text-ink/[.55] hover:text-ink',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {isPending && <NotificationSkeleton />}

      {isError && (
        <div className="pt-16 text-center">
          <p className="text-danger text-sm">
            {getErrorMessage(error, '알림을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
          >
            다시 시도
          </button>
        </div>
      )}

      {!isPending && !isError && items.length === 0 && (
        <NotificationEmpty filter={filter} />
      )}

      {!isPending && !isError && items.length > 0 && (
        <>
          <NotificationList items={items} intro={intro} onSelect={handleSelect} />
          {/* 무한 스크롤 센티널 — 뷰포트에 들어오면 다음 페이지를 받는다. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {isFetchingNextPage && (
            <p className="text-ink-subtle py-4 text-center text-sm">
              더 불러오는 중...
            </p>
          )}
        </>
      )}
    </div>
  )
}

function NotificationEmpty({ filter }: { filter: NotificationFilter }) {
  const unread = filter === 'UNREAD'
  return (
    <div className="flex flex-col items-center px-5 pt-[76px] pb-10 text-center">
      <span className="border-line bg-surface text-ink/[.5] flex h-16 w-16 items-center justify-center rounded-full border">
        {unread ? <CheckIcon size={26} /> : <BellOffIcon />}
      </span>
      <h2 className="mt-[22px] text-[19px] font-bold">
        {unread ? '읽지 않은 알림이 없어요' : '새로운 알림이 없어요'}
      </h2>
      <p className="text-ink-muted mt-[9px] max-w-[320px] text-sm leading-[1.7] break-keep">
        {unread
          ? '모든 알림을 확인했어요. 전체 알림은 위 필터에서 다시 볼 수 있어요.'
          : '게시물에 좋아요나 댓글이 달리거나 누군가 회원님을 팔로우하면 여기에서 알려드려요.'}
      </p>
    </div>
  )
}

/** 첫 로딩 자리표시자 — 실제 행과 같은 높이·간격이라 목록이 들어와도 화면이 튀지 않는다. */
function NotificationSkeleton() {
  return (
    <section className="pt-[26px]" aria-hidden>
      <div className="bg-line/60 mb-2.5 h-3 w-12 rounded" />
      <div className="border-line bg-surface animate-pulse overflow-hidden rounded-[10px] border">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className={`flex items-start gap-3.5 p-4 ${row > 0 ? 'border-line border-t' : ''}`}
          >
            <div className="bg-line/60 h-10 w-10 flex-none rounded-full" />
            <div className="flex-1">
              <div className="bg-line/60 h-4 w-3/5 rounded" />
              <div className="bg-line/60 mt-2 h-3 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 체크 — '읽지 않음 없음' 빈 상태에서 쓴다. 겹친 체크(✓✓)는 '전송/읽음 2단계'를 뜻하는
    메신저 관용구라 여기선 오해를 부른다. 단계가 하나뿐이므로 체크도 하나다. */
function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={size > 20 ? 1.5 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="m4 12.5 5.2 5.2L20 6.8" />
    </svg>
  )
}

function BellOffIcon() {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M8.7 3A6 6 0 0 1 18 8c0 2.3.4 4.1 1 5.4" />
      <path d="M17 17H4c1.3-1.4 2.7-2.9 2.7-9 0-.6.1-1.2.3-1.7" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

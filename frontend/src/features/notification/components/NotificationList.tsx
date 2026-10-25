import UserAvatar from '@/components/UserAvatar'
import { formatRelativeTime } from '@/features/feed/format'
import { groupLabel, notificationText } from '../format'
import type { NotificationItem, NotificationType } from '../types'

/**
 * 날짜 그룹 알림 목록 (시안 features/notification/NotificationList.tsx 이식).
 * 미읽음 행은 accent 8% 틴트 + 우측 8px 도트로 구분한다.
 *
 * 시안과 다른 두 가지 — 둘 다 서버에 데이터/엔드포인트가 없어서다:
 *  - 행 우상단 X(알림 삭제): 삭제 API가 없다. 지우면 되살릴 수 없는 동작이라
 *    "누르면 사라지는데 다시 뜨는" 흉내를 내지 않고 아예 두지 않았다.
 *  - 댓글 인용문(좌측 2px 룰): 알림 응답에 댓글 본문이 없다(target_comment_id만 온다).
 */

/** 아바타 우하단에 겹치는 19px 타입 아이콘. 이 화면 전용 글리프라 공용 icons.tsx에 넣지 않는다. */
function TypeBadge({ type }: { type: NotificationType }) {
  const glyph = {
    LIKE: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
    COMMENT: (
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      </svg>
    ),
    FOLLOW: (
      <svg
        width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6" />
        <path d="M22 11h-6" />
      </svg>
    ),
  }[type]

  return (
    <span className="border-line bg-surface text-brand-strong absolute -right-1 -bottom-1 flex h-[19px] w-[19px] items-center justify-center rounded-full border">
      {glyph}
    </span>
  )
}

export default function NotificationList({
  items,
  intro,
  onSelect,
}: {
  items: NotificationItem[]
  /** 첫 진입에서만 행을 순차 등장시킨다. 페이지를 더 불러올 때는 꺼서 이미 본 행이 다시 튀지 않게 한다. */
  intro: boolean
  onSelect: (item: NotificationItem) => void
}) {
  // 목록은 이미 최신순이라 앞에서부터 훑으며 같은 라벨끼리 묶으면 된다(정렬 불필요).
  const groups: { label: string; items: NotificationItem[] }[] = []
  for (const item of items) {
    const label = groupLabel(item.created_at)
    const last = groups.at(-1)
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }

  // 전체 개수가 많을수록 간격을 좁혀 등장이 총 0.76초 안에 끝나게 한다(시안 계산식).
  const stepMs = Math.max(34, Math.min(64, Math.round(760 / Math.max(1, items.length))))
  let flatIndex = 0

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} className="pt-[26px]">
          <h2 className="text-ink/[.58] mb-2.5 text-[12.5px] font-semibold tracking-[0.04em]">
            {group.label}
          </h2>
          <div className="border-line bg-surface overflow-hidden rounded-[10px] border shadow-sm">
            {group.items.map((item, i) => {
              const unread = !item.is_read
              const text = notificationText(item.type)
              const delay = flatIndex++ * stepMs
              return (
                <button
                  key={item.notification_id}
                  type="button"
                  onClick={() => onSelect(item)}
                  style={intro ? { animationDelay: `${delay}ms` } : undefined}
                  className={[
                    'flex w-full items-start gap-3.5 p-4 text-left transition-colors',
                    i > 0 ? 'border-line border-t' : '',
                    unread ? 'bg-brand/[8%] hover:bg-brand/[12%]' : 'hover:bg-surface-muted',
                    intro ? 'hw-nrow' : '',
                  ].join(' ')}
                >
                  <span className="relative flex-none">
                    <UserAvatar
                      user={{
                        nickname: item.actor_nickname,
                        profile_image_url: item.actor_profile_image_url,
                      }}
                      className="h-10 w-10"
                    />
                    <TypeBadge type={item.type} />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[14.5px] leading-[1.6] break-keep">
                      <span className="font-semibold">{item.actor_nickname}</span>
                      <span className="text-ink/[.84]">{text.pre}</span>
                      <span className="font-semibold">{text.target}</span>
                      <span className="text-ink/[.84]">{text.post}</span>
                    </span>
                    <span className="text-ink/[.56] text-[11px] tracking-[0.02em] tabular-nums">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </span>

                  {unread && (
                    <span
                      aria-label="읽지 않음"
                      className="bg-brand-hover mt-1.5 h-2 w-2 flex-none self-center rounded-full"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

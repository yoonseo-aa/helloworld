import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '@/components/UserAvatar'
import {
  displayNickname,
  formatRelativeTime,
  toExcerpt,
} from '@/features/feed/format'
import type { SearchPostItem, SearchStackItem, SearchUserItem } from '../types'

/**
 * 검색 결과 카드 2종(사용자·게시물) — ALL 그룹 뷰와 카테고리 탭 뷰가 같이 쓴다.
 * 시안(front handoff SearchResults.tsx)의 카드 규격: 헤어라인 테두리 + 흰 배경 +
 * radius 10px(--radius-md). 목록 배경이 회색(surface-muted)이라 카드가 떠 보인다.
 *
 * onClick은 지금은 no-op다(SearchView.tsx의 trackClick 참고 — 백엔드가 검색 실행
 * 시점에 이미 자동 기록해서 클릭 시점엔 더 할 일이 없다). preventDefault 없이 Link
 * 이동과 나란히 실행되는 자리라, 나중에 클릭 신호가 다시 필요해져도 이동을 막지 않는다.
 */

// display는 쓰는 쪽에서 붙인다 — 한 클래스 문자열에 block과 flex를 같이 두면
// 어느 쪽이 이기는지가 Tailwind의 CSS 출력 순서에 의존해 눈에 안 보이는 함정이 된다.
const CARD_CLASS =
  'border-line bg-surface hover:border-line-strong rounded-[10px] border transition-colors'

const POST_TYPE_LABEL = { PROJECT: '프로젝트', CARD_NEWS: '카드뉴스' } as const

/**
 * 검색어와 일치하는 첫 구간만 강조한다 (시안 Highlight와 같은 규칙).
 * 대소문자는 무시하고 원문 표기는 그대로 살린다 — 'react'로 검색해도 'React'가 나온다.
 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const at = keyword ? text.toLowerCase().indexOf(keyword.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-brand-subtle text-brand-deep rounded-[3px] px-0.5">
        {text.slice(at, at + keyword.length)}
      </mark>
      {text.slice(at + keyword.length)}
    </>
  )
}

export function UserRow({
  user,
  keyword,
  onClick,
}: {
  user: SearchUserItem
  keyword: string
  onClick: () => void
}) {
  return (
    <Link
      to={`/users/${user.user_id}`}
      onClick={onClick}
      className={`${CARD_CLASS} flex items-center gap-3.5 px-[18px] py-[15px]`}
    >
      <UserAvatar user={user} className="h-10 w-10" />
      {/* 시안은 닉네임 아래 한줄소개가 한 줄 더 붙지만, 검색 응답(UserSummaryResponse)에는
          소개도 이메일도 없다 — 백엔드를 건드리지 않기로 해서 닉네임 한 줄로 둔다. */}
      <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">
        <Highlight text={displayNickname(user)} keyword={keyword} />
      </span>
    </Link>
  )
}

export function PostRow({
  post,
  keyword,
  onClick,
}: {
  post: SearchPostItem
  keyword: string
  onClick: () => void
}) {
  return <PostCard post={post} keyword={keyword} onClick={onClick} />
}

export function StackRow({
  item,
  keyword,
  onClick,
}: {
  item: SearchStackItem
  keyword: string
  onClick: () => void
}) {
  return (
    <PostCard
      post={item}
      keyword={keyword}
      onClick={onClick}
      footer={
        <span className="mt-[11px] flex flex-wrap gap-[7px]">
          {item.matched_stacks.map((stack) => (
            <span
              key={stack}
              className="bg-brand-subtle text-brand-deep rounded-full px-2.5 py-[3px] text-[11px]"
            >
              #{stack}
            </span>
          ))}
        </span>
      }
    />
  )
}

/**
 * 게시물 카드 — 게시물 탭과 태그 탭이 공유한다. 두 탭의 응답 모양이 같고,
 * 태그 탭만 매칭된 태그 칩(footer)이 더 붙는다.
 * 시안대로 썸네일은 싣지 않는다 — 검색 응답의 thumbnail_url은 피드와 달리 첫 이미지로
 * 폴백하지 않아 카드뉴스는 대부분 비어 있고, 회색 자리표시자만 늘어섰었다.
 */
function PostCard({
  post,
  keyword,
  onClick,
  footer,
}: {
  post: SearchPostItem
  keyword: string
  onClick: () => void
  footer?: ReactNode
}) {
  return (
    <Link
      to={`/posts/${post.post_id}`}
      onClick={onClick}
      className={`${CARD_CLASS} block px-5 py-[18px]`}
    >
      <span className="mb-[9px] flex items-center gap-[9px]">
        <UserAvatar user={post.author} className="h-7 w-7" />
        <span className="text-ink text-[12.5px] font-medium">
          {displayNickname(post.author)}
        </span>
        <span aria-hidden className="bg-ink/35 h-[3px] w-[3px] rounded-full" />
        <span className="text-ink-subtle text-xs">
          {formatRelativeTime(post.created_at)}
        </span>
        <span className="border-line text-ink-muted ml-auto rounded-full border px-[9px] py-[3px] font-mono text-[10px] tracking-[0.04em]">
          {POST_TYPE_LABEL[post.post_type]}
        </span>
      </span>
      <span className="text-ink line-clamp-2 block text-[14.5px] leading-[1.7] break-keep">
        <Highlight
          text={toExcerpt(post.content_preview) || '본문 미리보기가 없는 글입니다.'}
          keyword={keyword}
        />
      </span>
      {footer}
    </Link>
  )
}

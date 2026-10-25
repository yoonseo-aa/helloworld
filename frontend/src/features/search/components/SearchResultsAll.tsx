import type { ReactNode } from 'react'
import { getErrorMessage } from '@/api/errors'
import { useSearchAll } from '../hooks'
import { PostRow, StackRow, UserRow } from './ResultRows'
import SearchEmpty from './SearchEmpty'
import type { SearchTabType } from '../types'

/** ALL 탭 — 카테고리별 상위 3건 그룹 + '더보기'(해당 탭으로 전환). */
export default function SearchResultsAll({
  keyword,
  onMore,
  onResultClick,
}: {
  keyword: string
  onMore: (type: SearchTabType) => void
  onResultClick: (clickedId: number) => void
}) {
  const { data, isPending, isError, error, refetch } = useSearchAll(keyword)

  if (isPending) {
    return (
      <p className="text-ink-subtle py-16 text-center text-sm">검색 중...</p>
    )
  }
  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-danger text-sm">
          {getErrorMessage(error, '검색에 실패했습니다.')}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
        >
          다시 시도
        </button>
      </div>
    )
  }

  // 서버가 ALL_PREVIEW_SIZE(=3)로 정확히 잘라서 준다(SearchService.ALL_PREVIEW_SIZE) —
  // has_more 필드는 안 내려주므로, 상한(3건)만큼 꽉 찼으면 더 있다고 추정한다.
  // (length > 3은 실제로 절대 발생하지 않아 '더보기'가 영원히 안 뜨는 버그였다.)
  const MAX_PREVIEW = 3
  const { users, posts, tech_stack_posts: stacks } = data
  const isEmpty = users.length === 0 && posts.length === 0 && stacks.length === 0
  if (isEmpty) {
    return <SearchEmpty keyword={keyword} />
  }

  return (
    <div>
      {users.length > 0 && (
        <Section
          title="사용자"
          hasMore={users.length > MAX_PREVIEW}
          onMore={() => onMore('USER')}
        >
          {users.slice(0, MAX_PREVIEW).map((user) => (
            <li key={user.user_id}>
              <UserRow
                user={user}
                keyword={keyword}
                onClick={() => onResultClick(user.user_id)}
              />
            </li>
          ))}
        </Section>
      )}
      {posts.length > 0 && (
        <Section
          title="게시물"
          hasMore={posts.length >= MAX_PREVIEW}
          onMore={() => onMore('POST')}
        >
          {posts.slice(0, MAX_PREVIEW).map((post) => (
            <li key={post.post_id}>
              <PostRow
                post={post}
                keyword={keyword}
                onClick={() => onResultClick(post.post_id)}
              />
            </li>
          ))}
        </Section>
      )}
      {stacks.length > 0 && (
        // 태그 검색 결과도 게시물이다 — 매칭된 태그 칩이 카드 안에 붙는다.
        <Section
          title="태그"
          hasMore={stacks.length >= MAX_PREVIEW}
          onMore={() => onMore('TECH_STACK')}
        >
          {stacks.slice(0, MAX_PREVIEW).map((item) => (
            <li key={item.post_id}>
              <StackRow
                item={item}
                keyword={keyword}
                onClick={() => onResultClick(item.post_id)}
              />
            </li>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  hasMore,
  onMore,
  children,
}: {
  title: string
  hasMore: boolean
  onMore: () => void
  children: ReactNode
}) {
  return (
    <section className="mb-[30px] last:mb-0">
      {/* 시안 SectionHead — 제목 + 남는 폭을 채우는 1px 구분선.
          시안엔 제목 옆에 건수가 붙지만 서버가 총 건수를 안 내려준다(ALL 응답은 3건에서
          잘려 온다) — 실제와 다른 숫자를 보여주느니 빼 둔다. */}
      <div className="mb-3 flex items-center gap-[11px]">
        <h2 className="text-[15px] font-bold tracking-[0.01em]">{title}</h2>
        <span aria-hidden className="bg-line h-px flex-1" />
        {hasMore && (
          <button
            type="button"
            onClick={onMore}
            className="text-brand hover:text-brand-hover text-xs font-medium transition-colors"
          >
            더보기
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">{children}</ul>
    </section>
  )
}

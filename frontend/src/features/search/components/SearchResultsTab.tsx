import { getErrorMessage } from '@/api/errors'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useSearchTab } from '../hooks'
import { PostRow, StackRow, UserRow } from './ResultRows'
import SearchEmpty from './SearchEmpty'
import type {
  SearchPostItem,
  SearchStackItem,
  SearchTabResponse,
  SearchTabType,
  SearchUserItem,
} from '../types'

type TabItem = SearchUserItem | SearchPostItem | SearchStackItem

/** 카테고리 탭 — 해당 카테고리만 커서 무한 스크롤 (limit 20). */
export default function SearchResultsTab({
  keyword,
  type,
  onResultClick,
}: {
  keyword: string
  type: SearchTabType
  onResultClick: (clickedId: number) => void
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
  } = useSearchTab<TabItem>(keyword, type)
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

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

  const pages = data.pages
  const rows = buildRows(pages, type, keyword, onResultClick)
  if (rows.length === 0) {
    return <SearchEmpty keyword={keyword} />
  }

  return (
    <>
      <ul className="flex flex-col gap-2.5">{rows}</ul>
      {/* 무한 스크롤 센티널 — 뷰포트에 들어오면 다음 페이지를 받는다. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <p className="text-ink-subtle py-4 text-center text-sm">
          더 불러오는 중...
        </p>
      )}
    </>
  )
}

/**
 * 탭 타입별로 페이지의 items를 꺼내 행 배열로 만든다.
 * 타입마다 item 모양이 달라서(유니온) 여기서 한 번만 분기·캐스팅한다 — 서버 응답
 * 자체엔 종류를 구분할 필드가 없어(SearchTabResponse 참고) type prop을 믿을 수밖에 없다.
 */
function buildRows(
  pages: SearchTabResponse<TabItem>[],
  type: SearchTabType,
  keyword: string,
  onResultClick: (clickedId: number) => void,
) {
  const items = pages.flatMap((page) => page.items)
  switch (type) {
    case 'USER':
      return (items as SearchUserItem[]).map((user) => (
        <li key={user.user_id}>
          <UserRow
            user={user}
            keyword={keyword}
            onClick={() => onResultClick(user.user_id)}
          />
        </li>
      ))
    case 'POST':
      return (items as SearchPostItem[]).map((post) => (
        <li key={post.post_id}>
          <PostRow
            post={post}
            keyword={keyword}
            onClick={() => onResultClick(post.post_id)}
          />
        </li>
      ))
    case 'TECH_STACK':
      // 태그 탭 — 태그가 달린 게시물이 나온다(서버 계약명만 TECH_STACK).
      return (items as SearchStackItem[]).map((item) => (
        <li key={item.post_id}>
          <StackRow
            item={item}
            keyword={keyword}
            onClick={() => onResultClick(item.post_id)}
          />
        </li>
      ))
  }
}

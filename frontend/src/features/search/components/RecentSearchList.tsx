import { getErrorMessage } from '@/api/errors'
import { useDeleteSearchHistory, useRecentSearches } from '../hooks'
import type { RecentSearch } from '../types'

/**
 * 최근 검색어 — SearchBar 포커스 시 드롭다운 오버레이 안에 보인다.
 * 저장은 서버가 검색 실행 시 자동으로 하므로(명세) 여기는 조회·삭제만 한다.
 *
 * 백엔드는 (keyword, search_type) 조합마다 별도 행으로 저장한다(탭별 복원 목적).
 * 그대로 보여주면 같은 키워드를 여러 탭에서 검색했을 때 목록에 중복으로 뜬다 —
 * 여기서 keyword로 묶어 가장 최근 것 하나만 화면에 보여준다. 삭제도 그 키워드의
 * 행 전부를 지워야 목록에서 완전히 사라진다(하나만 지우면 나머지 타입 행이 남아
 * 다시 나타난 것처럼 보인다).
 */
function dedupeByKeyword(recent: RecentSearch[]) {
  const groups = new Map<string, RecentSearch[]>()
  for (const item of recent) {
    const group = groups.get(item.keyword)
    if (group) group.push(item)
    else groups.set(item.keyword, [item])
  }
  // recent는 이미 서버가 최신순으로 내려주므로, 그룹의 첫 항목이 그 키워드의 최신 항목이다.
  return [...groups.values()].map((group) => ({ latest: group[0], allIds: group.map((g) => g.search_id) }))
}

export default function RecentSearchList({
  onSelect,
}: {
  /** 검색어를 누르면 그 keyword·type으로 검색을 복원한다. */
  onSelect: (recent: RecentSearch) => void
}) {
  const { data: recent, isPending, isError, error } = useRecentSearches()
  const { mutate: remove, isPending: isRemoving } = useDeleteSearchHistory()

  if (isPending) return null // 짧은 조회라 스피너 없이 빈 화면 유지 — 깜빡임 방지
  if (isError) {
    return (
      <p className="text-ink-subtle py-6 text-center text-sm">
        {getErrorMessage(error, '최근 검색어를 불러오지 못했습니다.')}
      </p>
    )
  }
  if (!recent || recent.length === 0) {
    return (
      <p className="text-ink-subtle py-6 text-center text-sm">
        게시물·사용자·기술스택을 검색해보세요.
      </p>
    )
  }

  const items = dedupeByKeyword(recent)

  return (
    <section>
      <div className="flex items-center justify-between px-3">
        <h2 className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
          최근 검색어
        </h2>
        <button
          type="button"
          onClick={() => remove(undefined)}
          disabled={isRemoving}
          className="text-ink-subtle hover:text-ink text-xs transition-colors disabled:opacity-50"
        >
          전체 삭제
        </button>
      </div>
      <ul className="mt-1">
        {items.map(({ latest, allIds }) => (
          <li key={latest.keyword} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(latest)}
              className="text-ink hover:bg-surface-muted min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition-colors"
            >
              {latest.keyword}
            </button>
            <button
              type="button"
              aria-label={`'${latest.keyword}' 검색 기록 삭제`}
              onClick={() => allIds.forEach((id) => remove(id))}
              disabled={isRemoving}
              className="text-ink-subtle hover:text-ink px-3 py-2 text-sm transition-colors disabled:opacity-50"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

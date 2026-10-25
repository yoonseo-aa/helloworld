import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  deleteAllSearchHistory,
  deleteSearchHistory,
  getRecentSearches,
  searchAll,
  searchByType,
} from './api'
import type { SearchTabType } from './types'

/**
 * 통합 검색 (type=ALL). keyword는 실행이 확정된 검색어(URL 기준)를 받는다 —
 * 실행 시점(버튼/Enter) 판단은 화면(SearchView) 책임이고, 여기는 2자 미만이면
 * 아예 요청하지 않는 것만 보장한다
 * (명세: 공백 trim 후 2자 이상, 미달 시 서버가 400 KEYWORD_TOO_SHORT).
 *
 * 백엔드가 GET /api/search 호출 자체를 최근 검색어로 자동 기록한다(SearchController.
 * search()의 recordSearch 부수효과) — 그래서 검색이 성공할 때마다 최근 검색어 캐시를
 * 여기서 무효화한다. 예전엔 이 역할을 존재하지 않는 POST /api/search/history를 부르는
 * useSaveSearchHistory에 맡겼는데, 그 호출이 항상 실패해서 "새로고침해야 최근 검색어가
 * 보이는" 버그와 "결과 클릭할 때마다 콘솔에 500" 두 가지 증상으로 같이 드러났다 —
 * 그 훅은 제거했다(SearchView.tsx 참고).
 */
export function useSearchAll(keyword: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['search', 'ALL', keyword],
    queryFn: async () => {
      const result = await searchAll(keyword)
      void queryClient.invalidateQueries({ queryKey: ['search', 'recent'] })
      return result
    },
    enabled: keyword.length >= 2,
  })
}

/**
 * 카테고리 탭 검색 — 커서 무한 스크롤.
 * TItem은 호출하는 쪽(SearchResultsTab)이 지금 보고 있는 탭에 맞는 아이템 타입을 넘긴다.
 * useSearchAll과 같은 이유로 페이지를 받을 때마다 최근 검색어 캐시를 무효화한다.
 */
export function useSearchTab<TItem>(keyword: string, type: SearchTabType) {
  const queryClient = useQueryClient()
  return useInfiniteQuery({
    queryKey: ['search', type, keyword],
    queryFn: async ({ pageParam }) => {
      const result = await searchByType<TItem>(keyword, type, pageParam)
      void queryClient.invalidateQueries({ queryKey: ['search', 'recent'] })
      return result
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.has_next ? lastPage.next_cursor : undefined),
    enabled: keyword.length >= 2,
  })
}

/** 최근 검색어 — 검색어가 비어 있을 때만 화면에 보이므로 enabled로 호출 시점을 제어한다. */
export function useRecentSearches(enabled = true) {
  return useQuery({
    queryKey: ['search', 'recent'],
    queryFn: getRecentSearches,
    enabled,
  })
}

/** 검색 기록 삭제 — historyId를 주면 개별, 안 주면 전체. */
export function useDeleteSearchHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (historyId?: number) =>
      historyId === undefined
        ? deleteAllSearchHistory()
        : deleteSearchHistory(historyId),
    // 실패해도 서버 상태를 다시 받아 화면과 어긋나지 않게 — onSuccess가 아니라 onSettled.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['search', 'recent'] })
    },
  })
}

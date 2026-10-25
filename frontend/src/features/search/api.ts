import { apiClient } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  RecentSearch,
  SearchAllResponse,
  SearchTabResponse,
  SearchTabType,
} from './types'

/** 통합 검색 (type=ALL) — 카테고리별 전체 배열. */
export async function searchAll(keyword: string) {
  const { data } = await apiClient.get<ApiResponse<SearchAllResponse>>(
    '/api/search',
    { params: { keyword } },
  )
  return data.data
}

/**
 * 카테고리 탭 검색 — 커서 페이징 (limit은 명세 기본값 20).
 * TItem은 호출하는 쪽(useSearchTab)이 type에 맞는 아이템 타입을 넘긴다 — 서버 응답
 * 자체엔 아이템 종류를 구분할 필드가 없어서 여기서 타입으로 강제할 수 없다.
 */
export async function searchByType<TItem>(
  keyword: string,
  type: SearchTabType,
  cursor?: string,
) {
  const { data } = await apiClient.get<ApiResponse<SearchTabResponse<TItem>>>(
    '/api/search',
    { params: { keyword, type, cursor, limit: 20 } },
  )
  return data.data
}

export async function getRecentSearches(): Promise<RecentSearch[]> {
  const { data } = await apiClient.get<ApiResponse<RecentSearch[]>>(
    '/api/search/recent',
    { params: { limit: 10 } },
  )
  return data.data
}

/** 실제 백엔드 라우트는 /recent다(SearchController.java 확인) — /history는 존재한 적 없다. */
export async function deleteSearchHistory(historyId: number) {
  await apiClient.delete(`/api/search/recent/${historyId}`)
}

export async function deleteAllSearchHistory() {
  await apiClient.delete('/api/search/recent')
}

import SearchView from '@/features/search/components/SearchView'

/**
 * 검색 — /search?keyword=&type=.
 *
 * 기능명세서(결과 페이지)와 시퀀스·API(검색 모달)가 갈려 있던 것을 **페이지형으로
 * 확정**(2026-08-01). 탭은 API 명세대로 4종(ALL/POST/USER/TECH_STACK)이고, URL이
 * 검색 상태의 단일 소스라 뒤로가기·새로고침·링크 공유가 자연스럽다.
 */
export default function SearchPage() {
  return <SearchView />
}

/**
 * 검색 API 타입 — 실제 be-search 브랜치 백엔드 응답(2026-08-05 실측)으로 다시 맞춘 계약.
 *
 * 이전엔 백엔드 domain/search가 미구현이라 노션 명세를 추측으로 옮긴 임시 계약(results
 * 래퍼 + has_more 그룹)이었는데, 실제 응답은 그보다 훨씬 평평하다 — 래퍼가 없고
 * has_more/next_cursor 같은 페이지네이션 메타도 일부 없다. 급하게 화면이 깨지지 않게
 * 지금 응답에 맞춘 "임시" 정합화라, be-search가 더 발전하면(특히 ALL 탭의 상위 3건
 * 커트라인·더보기 여부를 서버가 내려주기 시작하면) 다시 정리해야 한다.
 */

import type { PostType } from '@/features/feed/types'

/**
 * 서버 계약값이라 TECH_STACK 이름을 그대로 둔다 — 화면 라벨만 '태그'로 부른다
 * (SearchView.tsx TABS). 태그로 검색하면 그 태그가 달린 게시물이 나온다.
 */
export type SearchType = 'ALL' | 'POST' | 'USER' | 'TECH_STACK'

/** ALL을 뺀 카테고리 탭 — 커서 페이징 대상. */
export type SearchTabType = Exclude<SearchType, 'ALL'>

export interface SearchUserItem {
  user_id: number
  nickname: string
  profile_image_url: string | null
}

export interface SearchPostItem {
  post_id: number
  post_type: PostType
  /** Markdown 원문 — 화면에서는 toExcerpt로 발췌해 보여준다. */
  content_preview: string
  /** 서버가 null이면 키 자체를 생략한다(non_null 직렬화) — 지금 화면은 쓰지 않는다.
   *  검색 응답은 피드와 달리 첫 이미지로 폴백하지 않아 카드뉴스는 대부분 비어 있다. */
  thumbnail_url?: string | null
  created_at: string
  author: {
    user_id: number
    nickname: string
    profile_image_url: string | null
  }
}

/**
 * 기술스택(태그) 매칭 게시물 — 응답 모양은 POST와 동일하고
 * matched_stacks(검색어와 매칭된 태그명)만 더 붙는다.
 */
export interface SearchStackItem extends SearchPostItem {
  matched_stacks: string[]
}

/**
 * type=ALL 응답 — 래퍼·has_more 없이 카테고리별 전체 배열이 그대로 온다.
 * "상위 3건 + 더보기"는 이제 서버가 안 잘라준다는 뜻이라, 프론트가 3건으로 잘라
 * 보여주고 배열 길이가 3을 넘으면 더보기를 노출한다(SearchResultsAll.tsx 참고) —
 * 서버가 실제로 몇 건까지 돌려주는지 모르니 정확한 "더 있음" 판정은 아니다.
 */
export interface SearchAllResponse {
  users: SearchUserItem[]
  posts: SearchPostItem[]
  tech_stack_posts: SearchStackItem[]
}

/** 카테고리 탭 응답 — 요청한 type 하나에 대한 커서 페이지. next_cursor는 더 없으면
 * 필드 자체가 응답에서 빠진다(non_null 생략) — optional로 다룬다. */
export interface SearchTabResponse<TItem> {
  items: TItem[]
  has_next: boolean
  next_cursor?: string
}

export interface RecentSearch {
  search_id: number
  keyword: string
  /** 검색 당시 카테고리 — 다시 누르면 그 탭으로 복원한다. */
  search_type: SearchType
  searched_at: string
}

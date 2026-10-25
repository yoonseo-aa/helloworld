import { useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SearchResultsAll from './SearchResultsAll'
import SearchResultsTab from './SearchResultsTab'
import type { SearchType } from '../types'

/**
 * 검색 결과 화면 — /search?keyword=&type=.
 *
 * 검색 실행·최근 검색어는 SearchBar(드롭다운 오버레이) 몫이고, 여기는 URL에 실린
 * "실행된 검색"을 그리기만 한다. 네이버/X와 같은 구조 — 입력 단계는 오버레이,
 * 결과는 URL이 바뀌는 페이지라 뒤로가기·새로고침·링크 공유가 자연스럽다.
 * (2026-08-02: 디바운스 자동 실행 → 버튼/Enter 실행, 최근 검색어 본문 → 드롭다운 변경)
 */

const TABS: { value: SearchType; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'POST', label: '게시물' },
  { value: 'USER', label: '사용자' },
  // 서버 계약값은 TECH_STACK 그대로, 화면 이름만 '태그'. 태그로 검색하면 게시물이 나온다.
  { value: 'TECH_STACK', label: '태그' },
]

/** URL의 type 파라미터 해석 — 잘못된 값(직접 입력 등)은 ALL로 간주한다. */
function parseSearchType(raw: string | null): SearchType {
  return TABS.some((tab) => tab.value === raw) ? (raw as SearchType) : 'ALL'
}

export default function SearchView() {
  const [searchParams, setSearchParams] = useSearchParams()
  // 실행된 검색어 — 이 값이 바뀔 때만 API를 부른다.
  const keyword = (searchParams.get('keyword') ?? '').trim()
  const type = parseSearchType(searchParams.get('type'))

  const activeIndex = TABS.findIndex((tab) => tab.value === type)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  /**
   * 활성 탭 배경판의 위치·너비. 탭마다 글자 수가 달라(전체/게시물/사용자/태그) 너비가
   * 제각각이라 CSS만으로는 못 구하고 실제 버튼을 재야 한다 — 피드 탭 밑줄과 같은 방식.
   * null이면 아직 측정 전(판을 그리지 않는다 → 첫 프레임에 0에서 미끄러져 오지 않는다).
   */
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  // 활성 탭이 바뀔 때 다시 잰다. ResizeObserver를 같이 거는 이유는 웹폰트(Pretendard)가
  // 늦게 로드되면 글자 폭이 변해 판만 어긋난 채 남기 때문.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIndex]
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of tabRefs.current) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [activeIndex, keyword])

  /** 탭 전환 — 같은 검색어를 다른 카테고리로 다시 실행한다. */
  const switchTab = (nextType: SearchType) => {
    const params = new URLSearchParams()
    params.set('keyword', keyword)
    if (nextType !== 'ALL') params.set('type', nextType) // 기본값은 URL을 깨끗하게 생략
    setSearchParams(params)
  }

  /**
   * 결과 클릭 시그널 — 지금은 아무 것도 안 한다. 백엔드가 검색 실행(GET /api/search)
   * 시점에 이미 최근 검색어를 자동 기록하므로(SearchController.search()의 recordSearch
   * 부수효과), 결과를 클릭한 시점엔 더 기록할 게 없다. 예전엔 여기서 존재하지 않는
   * POST /api/search/history를 불러 클릭마다 500이 나고 있었다 — 그 호출을 걷어냈다.
   * onResultClick 자체는 남겨둔다 — 나중에 백엔드가 클릭 신호용 API를 추가하면
   * SearchResultsAll/Tab·ResultRows를 안 건드리고 여기만 다시 채우면 된다.
   */
  const trackClick = () => {}

  return (
    <>
      {/* 검색 입력은 AppLayout 스티키 헤더의 공통 검색바가 담당한다 (시안 이식, 2026-08-05).
          URL 검색어가 바뀌면 헤더 바에도 프리필된다 — 여기는 결과만 그린다. */}
      {/* 시안 SearchPage main — width min(880px, 100%), 패딩 모바일 22/16, 데스크톱 30/28 */}
      <div className="mx-auto w-full max-w-[880px] px-4 pt-[22px] pb-6 md:px-7 md:pt-[30px]">
        {keyword.length < 2 ? (
          // 검색 전(빈 keyword) 또는 URL을 직접 고쳐 1자로 진입한 경우.
          <p className="text-ink-subtle py-16 text-center text-sm">
            두 글자 이상 입력해 검색해보세요.
          </p>
        ) : (
          <>
            {/* 시안 검색 결과 헤더 — "'검색어' 검색 결과", 검색어만 accent-700로 강조.
                시안엔 옆에 "N건 · 0.14s"가 붙지만 서버가 총 건수도 소요시간도 안 내려준다. */}
            <h1 className="mb-[18px] text-[23px] font-bold tracking-[-0.015em] break-keep">
              '<span className="text-brand-strong">{keyword}</span>' 검색 결과
            </h1>

            {/* 시안 검색 범위 필터 — 좌측 정렬 세그먼트 컨트롤 (가로로 늘리지 않는다).
                활성: accent-100 배경 + accent-700 글자, 탭 사이 1px 구분선, 높이 40px */}
            <div
              role="tablist"
              aria-label="검색 범위"
              className="border-line bg-surface relative mb-6 inline-flex overflow-hidden rounded-[6px] border"
            >
              {/*
                활성 표시를 각 버튼에 칠하면 클릭할 때마다 색이 순간이동한다. 대신 판 하나가
                누른 탭으로 미끄러져 간다 — 어디서 어디로 옮겨갔는지가 눈에 남는다.
                (게시물 작성 모달의 종류 선택과 같은 연출·같은 이징)
              */}
              {pill && (
                <span
                  aria-hidden
                  style={{
                    transform: `translateX(${pill.left}px)`,
                    width: pill.width,
                  }}
                  className="bg-brand-subtle pointer-events-none absolute inset-y-0 left-0 transition-[transform,width] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
                />
              )}
              {TABS.map(({ value, label }, i) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={type === value}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  onClick={() => switchTab(value)}
                  className={[
                    // 판 위에 글자가 오도록 z-10. 배경은 판이 그리므로 버튼은 글자색만 바꾼다.
                    // 굵기를 전부 semibold로 고정한 이유: 활성일 때만 굵게 하면 그 탭의 폭이
                    // 늘어나 옆 탭들이 밀린다 — 판이 미끄러지는 동안 글자가 따로 튀어 보인다.
                    // (피드 탭 밑줄도 같은 이유로 굵기를 고정해 뒀다)
                    'relative z-10 inline-flex min-h-10 items-center px-4 text-[13.5px] font-semibold transition-colors',
                    i < TABS.length - 1 ? 'border-line border-r' : '',
                    type === value
                      ? 'text-brand-strong'
                      : 'text-ink/[.62] hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            {type === 'ALL' ? (
              <SearchResultsAll
                keyword={keyword}
                onMore={switchTab}
                onResultClick={trackClick}
              />
            ) : (
              <SearchResultsTab
                keyword={keyword}
                type={type}
                onResultClick={trackClick}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

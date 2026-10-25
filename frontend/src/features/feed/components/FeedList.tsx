import { useLayoutEffect, useRef, useState } from 'react'
import { getErrorMessage } from '@/api/errors'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useFeed } from '../hooks'
import PostCard from './PostCard'
import type { PostType } from '../types'

/** 카테고리 탭 — value가 undefined면 전체(post_type 파라미터 생략). */
const TABS: { value: PostType | undefined; label: string }[] = [
  { value: undefined, label: '전체' },
  { value: 'PROJECT', label: '프로젝트' },
  { value: 'CARD_NEWS', label: '카드뉴스' },
]

/**
 * 피드 카드 스켈레톤 — 시안 상태 뷰(ListStates) 이식: 첫 로딩에 2장, 페이지 append에 1장.
 * PostCard와 같은 골격(작성자 행 → 제목 → 본문 줄 → 비주얼)으로 자리를 잡아 CLS를 막는다.
 */
function PostCardSkeleton() {
  return (
    <div className="border-line animate-pulse border-b pt-[34px] pb-[14px]" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="bg-line/60 h-12 w-12 rounded-full" />
        <div className="bg-line/60 h-4 w-24 rounded" />
      </div>
      <div className="bg-line/60 mt-5 h-7 w-3/4 rounded" />
      <div className="bg-line/60 mt-3 h-4 w-full rounded" />
      <div className="bg-line/60 mt-2 h-4 w-5/6 rounded" />
      <div className="bg-line/60 mt-[22px] aspect-video w-full rounded-[10px]" />
    </div>
  )
}

/**
 * 메인 피드 — 카테고리 탭 + 무한 스크롤 목록.
 * 시안(front.zip handoff) 이식: 620px 단일 컬럼, 카드 박스 대신 헤어라인 아티클,
 * 첫 로딩·다음 페이지는 스켈레톤. 우측 사이드 위젯(≥1280, 업적/추천)은 achievement
 * API 미정이라 이번 범위에서 제외(handoff-notes §5-2).
 */
export default function FeedList() {
  const [postType, setPostType] = useState<PostType | undefined>(undefined)
  const activeIndex = TABS.findIndex((tab) => tab.value === postType)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  /**
   * 활성 탭 밑줄의 위치·너비. 탭마다 글자 수가 달라(전체/프로젝트/카드뉴스) 너비가 제각각이라
   * CSS만으로는 못 구하고 실제 버튼을 재야 한다. null이면 아직 측정 전(밑줄을 숨긴다).
   */
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null)
  // 활성 탭이 바뀔 때 밑줄을 다시 잰다. ResizeObserver를 같이 거는 이유는 두 가지 —
  // 창 너비가 바뀌면(gap이 md에서 달라진다) 버튼 위치가 밀리고, 웹폰트(Pretendard)가
  // 늦게 로드되면 글자 폭이 변해 밑줄만 어긋난 채 남는다.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeIndex]
      if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of tabRefs.current) {
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [activeIndex])

  /**
   * 목록 자체에는 전환 연출을 붙이지 않는다. 캐시가 살아있는 탭으로 되돌아가면 이미 불러온
   * 카드 전부(스크롤을 많이 내렸다면 수십~수백 장)가 한 번에 마운트되는데, 거기에 슬라이드를
   * 걸면 그 긴 요소 전체가 합성 레이어가 돼 비용이 목록 길이에 비례해 커진다.
   * 같은 이유로 key로 강제 remount 하지도 않는다 — React가 기존 DOM을 재조정하게 둔다.
   * 전환 피드백은 미끄러지는 밑줄 하나로 충분하다.
   */
  const selectTab = (value: PostType | undefined, index: number) => {
    if (index === activeIndex) return
    setPostType(value)
    // 탭을 바꾸면 목록이 통째로 달라지므로 스크롤 위치를 이어받을 이유가 없다. 그대로 두면
    // 한참 내려온 상태에서 글이 몇 개 없는 탭으로 갔을 때 빈 화면 한가운데에 떨어진다.
    // smooth를 쓰지 않는 이유: 수천 px 위로 부드럽게 올라가면 그동안 화면이 계속 흐르고,
    // 그 사이 무한 스크롤 센티널을 여러 번 지나쳐 다음 페이지 요청이 딸려 나간다.
    window.scrollTo(0, 0)
  }

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(postType)
  const posts = data?.pages.flatMap((page) => page.feeds) ?? []
  // isError를 enabled에서 빼는 것이 중요하다. 실패 후에도 센티널이 화면에 남는데,
  // enabled가 다시 true가 되면 옵저버가 새로 만들어지고 **이미 뷰포트 안에 있는 타깃에
  // 즉시 발화**하므로 실패 → 재요청 → 실패가 무한히 돈다. 재시도는 아래 버튼으로만 한다.
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage && !isError,
  })

  return (
    <main className="relative mx-auto max-w-[620px] px-4 pt-[18px] pb-[118px] md:px-8 md:pt-[30px] md:pb-[140px]">
      {/* 시안 밑줄 탭 — 헤더(60/66px) 아래 스티키. 밑줄은 탭마다 켜고 끄는 게 아니라
          하나짜리 막대가 활성 탭으로 미끄러진다(아래 underline). */}
      <div
        role="tablist"
        aria-label="피드 분류"
        className="border-line bg-surface-muted/[.92] sticky top-[60px] z-30 flex items-end justify-center gap-7 border-b backdrop-blur-lg md:top-[66px] md:gap-[38px]"
      >
        {TABS.map(({ value, label }, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={postType === value}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            onClick={() => selectTab(value, index)}
            className={[
              // 투명 테두리를 그대로 남겨 둔다 — 밑줄이 절대 배치로 빠져도 버튼 높이가 전과 같아야
              // 스티키 헤더 아래 위치가 안 밀린다.
              '-mb-px border-b-2 border-transparent px-0.5 py-3.5 text-sm font-semibold tracking-[-0.01em] transition-colors active:scale-[0.96] md:text-[15px]',
              postType === value ? 'text-ink' : 'text-ink/[.52] hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
        {/* 미끄러지는 밑줄. left가 아니라 transform으로 옮긴다(레이아웃 재계산 없이 합성만 하므로
            스티키 헤더 위에서도 매끄럽다). 측정 전에는 opacity 0이라 0px 막대가 안 보인다. */}
        <span
          aria-hidden
          className="bg-brand absolute bottom-[-1px] left-0 h-[2px] rounded-full transition-[transform,width,opacity] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
          style={{
            width: underline?.width ?? 0,
            opacity: underline ? 1 : 0,
            transform: `translateX(${underline?.left ?? 0}px)`,
          }}
        />
      </div>

      {/* 분기 순서에 이유가 있다: **가진 데이터가 우선**이다.
          예전엔 isError를 먼저 봐서, 3페이지까지 읽은 뒤 4페이지만 실패해도 이미 읽은
          카드 30장과 센티널이 통째로 사라지고 에러 한 줄만 남았다(TanStack Query는
          실패해도 data를 유지한다). 전면 에러는 보여줄 게 하나도 없을 때만 띄우고,
          목록이 있으면 목록을 계속 그린 뒤 아래에 인라인으로 알린다. */}
      {isPending ? (
        <div>
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      ) : isError && posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-danger text-sm">
            {getErrorMessage(error, '피드를 불러오지 못했습니다.')}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
          >
            다시 시도
          </button>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-ink-subtle py-16 text-center text-sm">
          아직 게시물이 없습니다. 첫 게시물을 작성해보세요!
        </p>
      ) : (
        <>
          <ul>
            {posts.map((post) => (
              <li key={post.post_id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
          {/* 무한 스크롤 센티널 — 뷰포트에 들어오면 다음 페이지를 받는다. */}
          <div ref={sentinelRef} aria-hidden className="h-px" />
          {/* 시안: 다음 페이지는 텍스트가 아니라 스켈레톤 카드를 append */}
          {isFetchingNextPage && <PostCardSkeleton />}
          {/* 목록은 그대로 두고 여기서만 알린다 — 읽던 자리와 스크롤 위치를 잃지 않는다. */}
          {isError && (
            <div className="py-6 text-center">
              <p className="text-danger text-sm">
                {getErrorMessage(error, '다음 게시물을 불러오지 못했습니다.')}
              </p>
              <button
                type="button"
                onClick={() => (hasNextPage ? fetchNextPage() : refetch())}
                className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
              >
                다시 시도
              </button>
            </div>
          )}
          {!hasNextPage && !isError && (
            <p className="text-ink/[.55] pt-10 text-center text-[12.5px] tracking-[0.05em]">
              — 새로운 소식을 모두 확인했어요 —
            </p>
          )}
        </>
      )}
    </main>
  )
}

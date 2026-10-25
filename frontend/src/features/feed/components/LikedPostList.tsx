import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '@/api/errors'
import Modal from '@/components/Modal'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useToastStore } from '@/stores/useToastStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { splitContent, toExcerpt } from '../format'
import { useLikedPosts, useToggleLike } from '../hooks'
import type { LikedPostItem, PostType } from '../types'

/**
 * 좋아요 목록 — 시안(front.zip handoff LikesPage) 이식: 정사각 3열 타일 그리드(gap 4px),
 * 호버 시 어두운 오버레이(제목·카운트), 우상단 하트 = 취소(확인 다이얼로그 → 토스트),
 * 셀은 중심에서 퍼지는 스태거(hw-cell)로 등장. 데이터·취소 흐름(20개 무한 스크롤,
 * useToggleLike 낙관 제거)은 기존 그대로.
 *
 * 시안과 다른 점 (실데이터 제약):
 * - 분류 탭(전체/프로젝트/카드뉴스)은 시안처럼 **클라이언트 필터** — 서버 API에
 *   post_type 파라미터가 없어서다(백엔드 요청해 둠). 서버 필터가 생기면 피드처럼
 *   쿼리 파라미터로 교체한다.
 * - 헤더 서브라인의 "N개 · 프로젝트 N · 카드뉴스 N" 전체 카운트는 뺐다 — 커서
 *   페이지네이션이라 전체 개수를 모른다(카운트 API도 없음, 계약 공백).
 * - 타일의 @handle·글리프 장식 → 닉네임·썸네일(없으면 유형 모노 라벨)로 대체.
 */
const TABS: { value: PostType | undefined; label: string }[] = [
  { value: undefined, label: '전체' },
  { value: 'PROJECT', label: '프로젝트' },
  { value: 'CARD_NEWS', label: '카드뉴스' },
]

/** 타일 등장 스태거의 상한(ms). 뒤 페이지 타일이 빈칸으로 오래 남지 않게 자른다. */
const MAX_TILE_DELAY_MS = 400

export default function LikedPostList() {
  const myUserId = useAuthStore((s) => s.userId)
  const [tab, setTab] = useState<PostType | undefined>(undefined)
  const [unlikeTarget, setUnlikeTarget] = useState<LikedPostItem | null>(null)
  const showToast = useToastStore((state) => state.show)
  const { mutate: toggleLike } = useToggleLike()
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLikedPosts(myUserId)
  const items = data?.pages.flatMap((page) => page.items) ?? []
  const visible = items.filter((item) => !tab || item.post_type === tab)
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

  const confirmUnlike = () => {
    if (!unlikeTarget) return
    // 토스트는 **결과가 온 뒤에** 띄운다. 성공 문구를 미리 띄우면 오프라인·서버 오류로
    // 롤백돼 타일이 되살아난 화면에 '취소했어요'만 남아 취소된 줄로 오인한다.
    toggleLike(unlikeTarget.post_id, {
      onSuccess: () => showToast('success', '좋아요를 취소했어요.'),
      onError: () => showToast('error', '좋아요 취소에 실패했습니다.'),
    })
    setUnlikeTarget(null)
  }

  const activeIndex = TABS.findIndex(({ value }) => value === tab)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  /**
   * 활성 탭 밑줄의 위치·너비. 탭마다 글자 수가 달라(전체/프로젝트/카드뉴스) 너비가 제각각이라
   * CSS로는 못 구하고 실제 버튼을 재야 한다 — 피드 탭 밑줄과 같은 방식.
   * null이면 아직 측정 전(밑줄을 그리지 않는다).
   */
  const [underline, setUnderline] = useState<{
    left: number
    width: number
  } | null>(null)
  // 활성 탭이 바뀌면 다시 잰다. ResizeObserver는 창 크기·웹폰트 로드로 버튼 폭이 변할 때용.
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

  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-[22px] pb-[112px] md:px-8 md:pt-[30px] md:pb-24">
      {/* 헤더 — 제목 + 우측 밑줄 탭 (시안 수치: 26px 제목, 헤어라인 하단) */}
      <div className="border-line flex flex-wrap items-end gap-3.5 border-b pb-[18px]">
        <div>
          <h1 className="text-ink text-[26px] font-bold tracking-[-0.02em]">
            좋아요 목록
          </h1>
          <p className="text-ink/[.64] mt-[7px] text-[13.5px]">내가 좋아요한 게시물</p>
        </div>
        <div
          role="group"
          aria-label="분류"
          className="relative -mb-[18px] ml-auto flex gap-[18px] self-end"
        >
          {TABS.map(({ value, label }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={tab === value}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              onClick={() => setTab(value)}
              className={[
                // 투명 테두리를 남겨 둔다 — 밑줄이 절대 배치로 빠져도 버튼 높이가 전과 같아야
                // 헤더 하단선과의 간격이 안 밀린다.
                'min-h-11 border-b-2 border-transparent px-0.5 pb-3.5 text-[14.5px] font-semibold tracking-[-0.01em] transition-colors',
                tab === value ? 'text-ink' : 'text-ink/[.52] hover:text-ink',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          {/* 미끄러지는 밑줄 — 활성 탭에 선을 칠하면 클릭할 때마다 순간이동한다.
              left가 아니라 transform으로 옮긴다(레이아웃 재계산 없이 합성만 하므로 매끄럽다). */}
          {underline && (
            <span
              aria-hidden
              style={{
                transform: `translateX(${underline.left}px)`,
                width: underline.width,
              }}
              className="bg-brand absolute bottom-[-1px] left-0 h-[2px] transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.25,1)] motion-reduce:transition-none"
            />
          )}
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-3 gap-1 pt-5" aria-label="좋아요 목록 불러오는 중">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-line/60 aspect-square animate-pulse" aria-hidden />
          ))}
        </div>
      ) : isError ? (
        <div className="py-16 text-center">
          <p className="text-danger text-sm">
            {getErrorMessage(error, '좋아요 목록을 불러오지 못했습니다.')}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
          >
            다시 시도
          </button>
        </div>
      ) : visible.length === 0 && hasNextPage ? (
        // 탭 필터 결과가 0건이지만 아직 받아올 페이지가 남은 상태 — "없음"이 아니라
        // "아직 못 찾음"이다. 아래 센티널이 다음 페이지를 계속 받는 동안 로딩을 보여준다.
        <p className="text-ink-subtle py-16 text-center text-sm">불러오는 중...</p>
      ) : visible.length === 0 ? (
        // 빈 상태 — 시안 마크업(하트 원 아이콘 + 안내 + 피드 CTA). 끝까지 받았는데도 0건일 때만.
        <div className="flex flex-col items-center px-5 pt-[76px] pb-10 text-center">
          <span className="border-line-strong bg-surface text-ink/[.5] flex h-16 w-16 items-center justify-center rounded-full border">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
          </span>
          <h2 className="text-ink mt-[22px] text-[19px] font-bold">
            좋아요한 게시물이 없어요
          </h2>
          <p className="text-ink/[.64] mt-[9px] max-w-[320px] text-sm leading-[1.7] break-keep">
            마음에 드는 프로젝트나 카드뉴스에 하트를 누르면 여기에 모여요.
          </p>
          <Link
            to="/"
            className="border-line-strong hover:bg-surface-muted mt-[22px] rounded-lg border px-[18px] py-2.5 text-sm transition-colors"
          >
            피드 둘러보기
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 pt-5">
          {visible.map((item, index) => (
            <LikedPostTile
              key={item.like_id}
              item={item}
              index={index}
              onUnlike={() => setUnlikeTarget(item)}
            />
          ))}
        </div>
      )}

      {/* 센티널은 **분기 밖**에 둔다. 탭 필터는 서버가 아니라 받아온 목록에서 거르는
          클라이언트 필터라, 첫 페이지 20건이 전부 다른 종류면 이 탭의 결과가 0건이 된다.
          예전엔 그때 빈 상태만 그리고 센티널을 통째로 안 그려서, 다음 페이지를 부를
          트리거가 사라지고 실제로 존재하는 항목을 영영 못 받았다. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {isFetchingNextPage && (
        <div className="grid grid-cols-3 gap-1 pt-1" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-line/60 aspect-square animate-pulse" />
          ))}
        </div>
      )}

      {unlikeTarget && (
        <Modal
          onClose={() => setUnlikeTarget(null)}
          label="좋아요 취소"
          className="max-w-[420px]"
        >
          <h2 className="text-ink text-[19px] leading-[1.35] font-bold tracking-[-0.015em]">
            좋아요 취소
          </h2>
          <p className="text-ink/[.78] mt-3 text-sm leading-[1.7] break-keep">
            “{tileTitle(unlikeTarget)}” 게시물의 좋아요를 취소합니다. 이 게시물은
            좋아요 목록에서 사라져요.
          </p>
          <div className="mt-[26px] flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setUnlikeTarget(null)}
              className="border-line-strong hover:bg-surface-muted rounded-lg border px-5 py-2.5 text-sm transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmUnlike}
              className="bg-brand-subtle text-brand-strong border-brand-hover rounded-lg border px-6 py-2.5 text-sm font-semibold transition-colors"
            >
              확인
            </button>
          </div>
        </Modal>
      )}

    </main>
  )
}

/** 타일 제목 — 본문 첫 헤딩(피드 카드와 같은 규칙), 없으면 발췌. 그마저 없으면 유형명. */
function tileTitle(item: LikedPostItem): string {
  const { title, body } = splitContent(item.content)
  return (
    title ||
    toExcerpt(body) ||
    (item.post_type === 'PROJECT' ? '프로젝트' : '카드뉴스')
  )
}

/**
 * 정사각 타일 — 시안 셀: 썸네일(없으면 중립 배경 + 유형 모노 라벨),
 * hover 오버레이(제목 + ♥·댓글 카운트), 우상단 하트(취소). 등장은 그리드 중심(1,1)에서
 * 거리 비례 딜레이의 스태거.
 *
 * 좌상단 작성자 닉네임은 두지 않는다 — 내가 좋아요한 글만 모인 화면이라 작성자보다
 * 무슨 글인지가 먼저 보여야 하고, 썸네일 위 글자가 그림을 가렸다.
 */
function LikedPostTile({
  item,
  index,
  onUnlike,
}: {
  item: LikedPostItem
  index: number
  onUnlike: () => void
}) {
  const title = tileTitle(item)
  // 중심에서 퍼지는 스태거. index는 목록 전체의 절대 인덱스라 무한 스크롤로 뒤에 붙는
  // 타일일수록 딜레이가 선형으로 커진다 — hw-cell이 `both`라 딜레이 동안 opacity 0으로
  // 고정되므로 5페이지쯤 가면 새 타일이 3초 넘게 빈칸으로 남아 로드가 멈춘 것처럼 보였다.
  // 연출은 첫 화면에서만 의미가 있으므로 상한을 둔다.
  const delay = Math.min(
    Math.round(Math.hypot(Math.floor(index / 3) - 1, (index % 3) - 1) * 108),
    MAX_TILE_DELAY_MS,
  )
  return (
    <div className="hw-cell group relative" style={{ animationDelay: `${delay}ms` }}>
      <Link
        to={`/posts/${item.post_id}`}
        aria-label={`${title} 좋아요한 게시물`}
        className="border-line bg-surface-muted relative flex aspect-square items-center justify-center overflow-hidden border"
      >
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-ink/[.4] font-mono text-[13px] tracking-[0.1em]">
            {item.post_type === 'PROJECT' ? 'PROJECT' : 'CARD NEWS'}
          </span>
        )}
        {/* hover 오버레이 — 제목·카운트. 모바일(호버 없음)은 상세에서 확인하는 흐름. */}
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#17181b]/[.62] p-4 text-center text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="line-clamp-2 text-[15px] font-bold tracking-[-0.01em] break-keep">
            {title}
          </span>
          <span className="flex gap-4 font-mono text-[12.5px] tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              {item.like_count}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              </svg>
              {item.comment_count}
            </span>
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onUnlike}
        aria-label={`${title} 좋아요 취소`}
        title="좋아요 취소"
        className="text-brand absolute top-2 right-[9px] z-[3] flex h-[26px] w-[26px] items-center justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform hover:scale-110"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </button>
    </div>
  )
}

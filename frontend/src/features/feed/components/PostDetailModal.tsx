import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getErrorMessage } from '@/api/errors'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import { displayNickname, formatRelativeTime } from '../format'
import { usePostDetail } from '../hooks'
import CardNewsCarousel from './CardNewsCarousel'
import CommentPanel from './CommentPanel'
import DemoStage from './DemoStage'
import type { PostDetailResponse } from '../types'

/**
 * 게시글 상세 모달 — 좌: 체험(라이브 데모 iframe / 카드뉴스 캐러셀), 우: 본문·AI 요약·댓글.
 *
 * FeedPage의 자식 라우트로 열린다 (URL: /posts/:postId). 닫으면 부모 경로(/)로 돌아간다 —
 * 뒤로가기로 닫지 않는 이유는 close() 주석 참고(체험 iframe이 히스토리를 쌓는다).
 *
 * 상단바 버튼: 새 창에서 열기 · 전체 화면 · 닫기. 프로토타입에 있던 '댓글 패널 접기'는
 * 전체 화면과 "댓글 숨김 + 모달 크기 차이"뿐이라 헷갈려서 뺐다 (2026-08-03 합의).
 */
export default function PostDetailModal({ postId }: { postId: number }) {
  const navigate = useNavigate()
  // 구조 분해하면 TS가 isPending/isError로 data를 좁히지 못한다 — 쿼리 객체째로 든다.
  const detailQuery = usePostDetail(postId)
  // zen(전체 화면) = 모달을 화면 가득 + 댓글 패널 숨김.
  const [zen, setZen] = useState(false)
  const showPanel = !zen

  /**
   * 닫기(X · Esc · 배경 클릭).
   *
   * <p><b>뒤로가기로 닫지 않는다.</b> 예전엔 {@code navigate(-1)}이었는데, 좌측 체험
   * 영역의 iframe 안에서 링크를 누르면 그 이동이 <b>브라우저 히스토리에 쌓인다</b>
   * (하위 프레임 이동도 최상위 세션 히스토리에 들어간다). 그래서 뒤로가기는 모달을
   * 닫는 대신 iframe이 쌓아둔 항목을 하나씩 되돌렸고, 데모를 조작한 횟수만큼
   * X를 눌러야 닫히는 상태였다.
   *
   * <p>대신 부모 경로로 직접 이동한다. 이 모달은 {@code /} (FeedPage)의 자식 라우트라
   * (router.tsx) 배경은 언제나 피드이고, 부모 라우트는 그대로 마운트된 채라 목록 스크롤
   * 위치도 유지된다. 히스토리를 몇 칸 되돌려야 하는지 셀 필요가 없어 <b>항상 한 번에</b> 닫힌다.
   */
  const close = () => {
    navigate('/', { replace: true })
  }

  const modalSize = zen
    ? 'flex h-[calc(100dvh-2rem)] max-w-none flex-col overflow-hidden'
    : 'flex h-[min(85dvh,60rem)] max-w-6xl flex-col overflow-hidden'

  if (Number.isNaN(postId) || detailQuery.isPending || detailQuery.isError) {
    // NaN이면 쿼리를 아예 안 보내(enabled: false) isPending이 영원히 참이다 — NaN을 먼저 가른다.
    const isLoading = !Number.isNaN(postId) && detailQuery.isPending
    return (
      <Modal onClose={close} label="게시글 상세" bare className={modalSize}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          {isLoading ? (
            <p className="text-ink-subtle text-sm">게시글을 불러오는 중...</p>
          ) : (
            <>
              <p className="text-danger text-sm">
                {Number.isNaN(postId)
                  ? '게시물을 찾을 수 없습니다.'
                  : getErrorMessage(detailQuery.error, '게시글을 불러오지 못했습니다.')}
              </p>
              <button
                type="button"
                onClick={close}
                className="border-line hover:bg-surface-muted rounded-lg border px-4 py-2 text-sm"
              >
                닫기
              </button>
            </>
          )}
        </div>
      </Modal>
    )
  }

  const post = detailQuery.data

  return (
    <Modal onClose={close} label="게시글 상세" bare className={modalSize}>
      <Topbar post={post} zen={zen} onToggleZen={() => setZen((z) => !z)} onClose={close} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className={
            showPanel
              ? 'bg-surface-muted relative aspect-video w-full flex-none md:aspect-auto md:min-h-0 md:flex-1'
              : 'bg-surface-muted relative min-h-0 flex-1'
          }
        >
          <Stage post={post} />
        </div>
        {showPanel && <CommentPanel post={post} />}
      </div>
    </Modal>
  )
}

function Topbar({
  post,
  zen,
  onToggleZen,
  onClose,
}: {
  post: PostDetailResponse
  zen: boolean
  onToggleZen: () => void
  onClose: () => void
}) {
  // '새 창에서 열기'는 데모가 우선, 없으면 저장소라도 연다 (둘 다 없으면 버튼 자체를 숨김).
  const externalUrl = post.deploy_url ?? post.github_url

  return (
    <header className="border-line flex flex-none items-center gap-3 border-b px-4 py-2.5">
      <UserAvatar user={post.author} />
      <div className="min-w-0 flex-1">
        {/* 타입 뱃지(프로젝트/카드뉴스)는 시안 이식 때 제거 — 피드 카드와 동일하게
            비주얼(플레이트/캐러셀·CARD NEWS 라벨)이 유형을 말해준다. */}
        <p className="text-ink truncate text-sm font-semibold">{displayNickname(post.author)}</p>
        <p className="text-ink-subtle flex items-center gap-1.5 text-xs">
          <time dateTime={post.created_at}>{formatRelativeTime(post.created_at)}</time>
          {post.deploy_url && (
            <span className="hidden truncate font-mono md:inline">{post.deploy_url}</span>
          )}
        </p>
      </div>

      <div className="flex flex-none items-center gap-1">
        {externalUrl && (
          <IconButton
            label="새 창에서 열기"
            onClick={() => window.open(externalUrl, '_blank', 'noopener')}
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </IconButton>
        )}
        <IconButton
          label={zen ? '창 모드로' : '전체 화면'}
          pressed={zen}
          onClick={onToggleZen}
        >
          {zen ? (
            <>
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </>
          ) : (
            <>
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </>
          )}
        </IconButton>
        <IconButton label="닫기 (Esc)" onClick={onClose} hoverDanger>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </IconButton>
      </div>
    </header>
  )
}

/** 상단바 아이콘 버튼 — 17px stroke 아이콘 공통 래퍼. */
function IconButton({
  label,
  onClick,
  pressed,
  hoverDanger = false,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  hoverDanger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={[
        'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        hoverDanger
          ? 'text-ink-subtle hover:bg-danger/10 hover:text-danger'
          : pressed
            ? 'text-ink hover:bg-surface-muted'
            : 'text-ink-subtle hover:bg-surface-muted hover:text-ink',
      ].join(' ')}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  )
}

/** 좌측 체험 영역 분기 — 프로젝트는 라이브 데모, 카드뉴스는 캐러셀, 데모 없으면 안내. */
function Stage({ post }: { post: PostDetailResponse }) {
  if (post.post_type === 'CARD_NEWS' && post.image_urls.length > 0) {
    return <CardNewsCarousel images={post.image_urls} />
  }
  if (post.deploy_url) {
    return <DemoStage url={post.deploy_url} title={`${displayNickname(post.author)}의 프로젝트`} />
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-ink font-semibold">체험할 수 있는 데모가 없어요</p>
      <p className="text-ink-muted max-w-sm text-sm leading-relaxed break-keep">
        이 게시물에는 배포 URL이 등록되지 않았어요.
        {post.github_url && ' 대신 저장소에서 코드를 볼 수 있어요.'}
      </p>
      {post.github_url && (
        <button
          type="button"
          onClick={() => window.open(post.github_url!, '_blank', 'noopener')}
          className="bg-brand mt-1 rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          GitHub 저장소 보기
        </button>
      )}
    </div>
  )
}

import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { getErrorMessage } from '@/api/errors'
import Modal from '@/components/Modal'
import UserAvatar from '@/components/UserAvatar'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useToastStore } from '@/stores/useToastStore'
import { formatRelativeTime } from '../format'
import {
  useCreateComment,
  useDeleteComment,
  usePostComments,
  useToggleCommentLike,
  useToggleLike,
} from '../hooks'
import LikeListModal from './LikeListModal'
import MarkdownContent from './MarkdownContent'
import type { PostDetailResponse } from '../types'

/**
 * 게시글 상세 우측 패널 — 본문(Markdown) → AI 요약 → 태그 → 저장소 링크,
 * 아래로 댓글 무한 스크롤, 하단 고정으로 좋아요·댓글 수 + 댓글 입력.
 *
 * 댓글 작성은 낙관적 업데이트(useCreateComment) — 실패하면 목록이 롤백되고 입력창에
 * 내용이 복원돼 재전송할 수 있다 (명세 확정 UX).
 */
export default function CommentPanel({ post }: { post: PostDetailResponse }) {
  const [isLikesOpen, setLikesOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<number | null>(null)
  const { mutate: toggleLike, isPending: isToggling } = useToggleLike()
  const { mutate: submitComment } = useCreateComment(post.post_id)
  const showToast = useToastStore((state) => state.show)
  const { mutate: toggleCommentLike, isPending: isTogglingComment, variables: togglingCommentId } =
    useToggleCommentLike(
    post.post_id,
  )
  const { mutate: removeComment } = useDeleteComment(post.post_id)

  function confirmDeleteComment() {
    if (confirmDeleteCommentId !== null) removeComment(confirmDeleteCommentId)
    setConfirmDeleteCommentId(null)
  }

  const {
    data,
    isPending: isCommentsPending,
    isError: isCommentsError,
    error: commentsError,
    refetch: refetchComments,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePostComments(post.post_id)
  const comments = data?.pages.flatMap((page) => page.items) ?? []
  // isError를 enabled에서 빼야 한다 — 실패 후 센티널이 남은 채 enabled가 다시 켜지면
  // 옵저버가 새로 만들어지며 뷰포트 안 타깃에 즉시 발화해 재요청 루프가 된다.
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage && !isCommentsError,
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    // 낙관적 UX: 입력은 바로 비운다. 실패하면 onError가 내용을 되돌려 준다.
    setDraft('')
    setSubmitError(null)
    submitComment(content, {
      onSuccess: () => showToast('success', '댓글을 등록했어요.'),
      onError: () => {
        setDraft((current) => current || content)
        setSubmitError('댓글 등록에 실패했습니다. 다시 등록해주세요.')
      },
    })
  }

  return (
    <aside className="border-line flex min-h-0 flex-1 flex-col border-t md:w-[380px] md:flex-none md:border-t-0 md:border-l">
      {/*
        본문(Markdown 원문)을 이 패널에 펼쳐 두지 않는다. 여기 오는 목적은 대개 댓글인데
        본문이 위에 길게 깔려 있으면 열 때마다 스크롤로 그만큼을 지나쳐야 한다.
        '내용 보기'로 접어 두고, 볼 사람만 펼친다. 무엇에 대한 글인지는 왼쪽 무대가 말해준다.

        영역을 나눈 이유(내용 / 댓글 / 입력): 한 스크롤이면 댓글을 읽다가 입력창을 보려면
        끝까지 내려야 한다. 갈라 두면 셋 다 화면에 남는다.

        이 블록 자체에는 높이 제한을 두지 않는다. 여기에 걸면 아래 기술 스택·저장소 링크까지
        갇혀서 펼쳐도 밀려 내려오지 않고 작은 창 안에서 스크롤된다. 긴 내용은 상자 안쪽에서만
        스크롤한다.
      */}
      <div className="border-line flex-none border-b px-4 py-3">
        <AiSummarySection post={post}>
          {post.tech_stacks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tech_stacks.map((tag) => (
                <span
                  key={tag}
                  className="bg-surface-muted text-ink-muted rounded-full px-2.5 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 저장소 링크 — 작성 폼에서 받은 주소를 상세에서 되돌려준다.
              배포 사이트로 가는 길은 상단바 '새 창에서 열기'가 이미 있어 여기엔 두지 않는다. */}
          {post.github_url && (
            <a
              href={post.github_url}
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted hover:text-ink group mt-3 flex min-w-0 items-center gap-1.5 text-xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span className="truncate font-mono group-hover:underline">
                {post.github_url.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
              </span>
            </a>
          )}
        </AiSummarySection>
      </div>

      {/*
        댓글 — 이 패널의 주인공이라 남는 높이를 전부 갖고, 자기 안에서 스크롤한다.
        건수 헤더는 sticky다(시안): 목록을 내려도 "지금 몇 개짜리 목록을 보고 있는지"가 남는다.
      */}
      {/* 위쪽 안쪽 여백을 두지 않는다 — 여백이 있으면 sticky 헤더가 그 위에 얹혀도
          1px 단위 반올림에서 틈이 생겨 댓글이 스쳐 보인다. 여백은 헤더가 직접 갖는다. */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] px-[18px] pb-3.5">
        {/*
          음수 가로 마진으로 스크롤 영역의 안쪽 여백 밖까지 배경을 넓힌다.
          여백 안에만 배경을 깔면 좌우 18px이 뚫린 채로 남아 스크롤할 때 그 틈으로
          댓글이 지나가는 게 보인다. 헤더는 "가리는 판"이라 끝에서 끝까지 덮어야 한다.
          위쪽은 컨테이너에 여백을 두지 않는 것으로 해결한다(음수 마진으로 끌어올리면
          반올림 때문에 1px 틈이 남는다). 아래 선은 목록과의 경계.
        */}
        <div className="bg-surface border-line text-ink/[.52] sticky top-0 z-[2] -mx-[18px] border-b px-[18px] pt-3 pb-2 text-[12.5px] font-semibold tabular-nums">
          댓글 {post.comment_count}
        </div>
        {/* 이미 받은 댓글이 있으면 실패해도 목록을 지우지 않는다(FeedList와 같은 규칙). */}
        {isCommentsPending ? (
          <p className="text-ink-subtle py-8 text-center text-sm">불러오는 중...</p>
        ) : isCommentsError && comments.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-danger text-sm">
              {getErrorMessage(commentsError, '댓글을 불러오지 못했습니다.')}
            </p>
            <button
              type="button"
              onClick={() => refetchComments()}
              className="border-line hover:bg-surface-muted mt-3 rounded-lg border px-4 py-2 text-sm"
            >
              다시 시도
            </button>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-ink-subtle py-8 text-center text-sm">
            아직 댓글이 없어요. 첫 댓글을 남겨보세요!
          </p>
        ) : (
          <ul>
            {/* 행 사이를 여백이 아니라 윗선으로 가른다(시안) — 폭이 좁아 여백만으로는 경계가 흐려진다. */}
            {comments.map((comment) => (
              // 첫 행은 윗선을 지운다 — 바로 위 sticky 헤더의 아랫선과 겹쳐 두 줄로 보인다.
              <li
                key={comment.comment_id}
                className="border-line flex gap-2.5 border-t py-[11px] first:border-t-0"
              >
                <UserAvatar user={comment.author} className="h-8 w-8 flex-none" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[7px]">
                    <span className="text-ink truncate text-[13px] font-semibold">
                      {comment.author.nickname}
                    </span>
                    <span className="text-ink/[.48] flex-none text-[11.5px]">
                      <time dateTime={comment.created_at}>
                        {formatRelativeTime(comment.created_at)}
                      </time>
                    </span>
                    {/* 좋아요·삭제는 오른쪽 끝으로 민다 — 시안의 '삭제' 자리와 같다. */}
                    <span className="ml-auto flex flex-none items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleCommentLike(comment.comment_id)}
                        disabled={isTogglingComment && togglingCommentId === comment.comment_id}
                        aria-pressed={comment.is_liked}
                        aria-label={comment.is_liked ? '댓글 좋아요 취소' : '댓글 좋아요'}
                        className={[
                          'rounded px-1 py-0.5 text-[12px] transition-colors',
                          comment.is_liked ? 'text-danger' : 'text-ink/[.45] hover:text-danger',
                        ].join(' ')}
                      >
                        {comment.is_liked ? '♥' : '♡'}
                      </button>
                      {comment.like_count > 0 && (
                        <span className="text-ink/[.45] text-[11.5px] tabular-nums">
                          {comment.like_count}
                        </span>
                      )}
                      {comment.is_mine && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCommentId(comment.comment_id)}
                          aria-label="내 댓글 삭제"
                          className="text-ink/[.45] hover:text-danger ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11.5px] transition-colors"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                            <path d="M19 6l-.8 13a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 6" />
                          </svg>
                          삭제
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="text-ink/[.80] mt-1 text-[13.5px] leading-[1.72] break-words break-keep">
                    {comment.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={sentinelRef} aria-hidden className="h-px" />
        {isCommentsError && comments.length > 0 && (
          <div className="py-4 text-center">
            <p className="text-danger text-[13px]">
              {getErrorMessage(commentsError, '다음 댓글을 불러오지 못했습니다.')}
            </p>
            <button
              type="button"
              onClick={() => (hasNextPage ? fetchNextPage() : refetchComments())}
              className="border-line hover:bg-surface-muted mt-2 rounded-lg border px-3 py-1.5 text-[13px]"
            >
              다시 시도
            </button>
          </div>
        )}
        {isFetchingNextPage && (
          <p className="text-ink-subtle py-3 text-center text-sm">더 불러오는 중...</p>
        )}
      </div>

      {/* 댓글 입력 — 시안은 좋아요 바보다 위다. 입력이 목록에 붙어 있어야 방금 읽은 흐름에서 이어 쓴다. */}
      <div className="border-line flex-none border-t px-[18px] py-3">
        {submitError && <p className="text-danger mb-1.5 text-xs">{submitError}</p>}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="댓글을 남겨보세요"
            aria-label="댓글 입력"
            className="border-line bg-surface text-ink placeholder:text-ink-subtle focus:border-brand min-h-[42px] min-w-0 flex-1 rounded-lg border px-3 text-[13.5px] outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="bg-brand-hover min-h-[42px] flex-none rounded-lg px-4 text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            등록
          </button>
        </form>
      </div>

      {/* 좋아요·댓글 수 — 시안은 맨 아래 별도 바. 숫자를 누르면 좋아요 누른 사람 목록. */}
      <div className="border-line bg-surface-muted flex flex-none items-center gap-1 border-t px-3.5 py-[9px]">
        <button
          type="button"
          onClick={() => toggleLike(post.post_id)}
          disabled={isToggling}
          aria-pressed={post.is_liked}
          aria-label={post.is_liked ? '좋아요 취소' : '좋아요'}
          className={[
            'rounded-lg py-1.5 pr-1.5 pl-2.5 text-[15px] transition-colors',
            post.is_liked ? 'text-danger' : 'text-ink/[.6] hover:text-danger',
          ].join(' ')}
        >
          {post.is_liked ? '♥' : '♡'}
        </button>
        <button
          type="button"
          onClick={() => setLikesOpen(true)}
          aria-label={`좋아요 ${post.like_count}명 보기`}
          className={[
            'hover:text-ink rounded-lg px-2 py-1.5 text-[13.5px] tabular-nums transition-colors',
            post.is_liked ? 'text-danger' : 'text-ink/[.6]',
          ].join(' ')}
        >
          {post.like_count}
        </button>
        <span className="text-ink/[.6] inline-flex items-center gap-[7px] px-2.5 py-1.5 text-[13.5px] tabular-nums">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
          {post.comment_count}
        </span>
      </div>

      {isLikesOpen && (
        <LikeListModal postId={post.post_id} onClose={() => setLikesOpen(false)} />
      )}

      {confirmDeleteCommentId !== null && (
        <Modal
          onClose={() => setConfirmDeleteCommentId(null)}
          label="댓글 삭제 확인"
          className="max-w-xs"
        >
          <p className="text-ink text-sm">댓글을 삭제할까요?</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteCommentId(null)}
              className="border-line rounded-lg border px-3 py-1.5 text-sm hover:bg-surface-muted"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmDeleteComment}
              className="bg-danger rounded-lg px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              삭제
            </button>
          </div>
        </Modal>
      )}
    </aside>
  )
}

/**
 * 내용 보기 — 작성자가 쓴 본문을 접어 두고 버튼으로 펼친다.
 *
 * <p><b>보여주는 것은 언제나 {@code post.content}(본문)다.</b> 저장소를 고르면 서버가 만든
 * 요약이 작성 폼의 본문 초안으로 들어가고 작성자가 그걸 고쳐서 올린다 — 즉 본문이 곧
 * 사람이 확정한 글이다. {@code posts.ai_summary}는 그 과정에서 남는 부산물이라 화면에 쓰지 않는다.
 * (상세 응답의 {@code summary}는 지금 저장된 JSON 문자열을 그대로 흘려보내고 있어서
 *  그리면 사용자에게 {@code {"one_liner":...}} 원문이 노출된다 — 백엔드 확인이 필요하다.)
 *
 * <p>버튼은 <b>항상</b> 그린다. 글마다 있다 없다 하면 "이 글은 왜 없지"를 매번 판단해야 한다.
 * 본문은 서버 필수값이라 펼쳤는데 빈 상자가 나오는 경우는 없다.
 */
function AiSummarySection({
  post,
  children,
}: {
  post: PostDetailResponse
  /** 기술 스택·저장소 링크. 상자 밖(흰 영역)에 두되 펼칠 때 함께 내려앉는다. */
  children?: ReactNode
}) {
  const [isOpen, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-expanded={isOpen}
        className="border-brand text-brand hover:bg-brand-subtle inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
        {isOpen ? '내용 접기' : '내용 보기'}
      </button>

      {isOpen && (
        <div className="hw-drop">
          {/*
            시안(PostQuickView)의 상자 — 테두리 + 브랜드색 5% 배경. 불투명 베이지보다 옅어서
            "본문 영역"으로만 읽히고 버튼·태그보다 앞으로 튀지 않는다.

            스크롤은 **상자 안쪽에만** 건다. 블록 전체에 걸면 아래 기술 스택·저장소 링크까지
            갇혀 펼쳐도 밀려 내려오지 않는다.
          */}
          <div className="border-line bg-brand/[5%] mt-3 max-h-[38vh] overflow-y-auto [scrollbar-gutter:stable] rounded-lg border px-[15px] py-3.5">
            <MarkdownContent>{post.content}</MarkdownContent>
          </div>
        </div>
      )}

      {/*
        기술 스택·저장소 링크는 접혀 있어도 늘 보인다 — 글을 열자마자 무슨 기술로 만들었는지
        보이는 편이 낫다. 다만 위에서 상자가 펼쳐지면 그만큼 밀리는데 그냥 두면 툭 끊겨 보인다.
        isOpen을 key로 걸어 토글마다 같은 hw-drop을 다시 재생시켜 함께 내려앉게 한다.
      */}
      <div key={String(isOpen)} className="hw-drop">
        {children}
      </div>
    </div>
  )
}



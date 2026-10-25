import { useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '@/components/UserAvatar'
import { displayNickname, formatRelativeTime, splitContent, toExcerpt } from '../format'
import { useToggleLike } from '../hooks'
import LikeListModal from './LikeListModal'
import type { FeedItem } from '../types'

/**
 * 대표컷 액자 — 시안 .plate: 1px 헤어라인 + 6px 표면색 매트, hover 리프트.
 *
 * 예전엔 `border-[6px] border-surface` + `outline-1 outline-line`이었는데, 테마를 전환하면
 * **액자가 검정↔흰색으로 번쩍였다.** --color-surface가 보간되는 동안 border-color 선언이
 * 무효가 되면서 초기값인 currentColor(= 글자색: 라이트 검정 / 다크 흰색)로 떨어지기
 * 때문이다 — 사이드바 활성 아이콘이 검정으로 번쩍이던 것과 같은 원인이고, 초기값이
 * 무엇이냐만 달랐다(index.css의 전환 목록 주석 참고).
 *
 * 그래서 같은 그림을 **배경색으로** 그린다. background-color의 초기값은 transparent라
 * 같은 일이 벌어져도 부모 배경이 비칠 뿐 번쩍일 색이 없다.
 * 바깥 1px = 헤어라인, 안쪽 6px = 표면색 매트. 반지름은 11 → 10 → 4로 줄여 예전
 * border+outline 조합의 곡률(바깥 10px, 안쪽 10-6=4px)을 그대로 유지한다.
 */
function CoverPlate({ to, label, cover }: { to: string; label: string; cover: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="bg-line mt-[22px] block rounded-[11px] p-px transition-[transform,box-shadow] duration-[180ms] ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="bg-surface rounded-[10px] p-[6px]">
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="bg-surface-muted aspect-square w-full rounded-[4px] object-cover"
        />
      </div>
    </Link>
  )
}

/**
 * 피드 카드 — 시안(front.zip handoff FeedCard) 이식: 박스가 아니라 헤어라인으로 구분되는
 * 아티클. 작성자 행(48px 아바타) → 제목(27px) → 요약 → 비주얼 → 우하단 액션.
 * 수치(34/14px 패딩, 22px 비주얼 간격, 52/66% 텍스트 투명도)는 시안 값 그대로다.
 *
 * 시안과 다른 점 (실데이터 제약, handoff-notes 치환 목록 기준):
 * - 업적 뱃지(BadgeChip): achievement API 미정(§5-2)이라 생략.
 * - 제목: 서버에 title 컬럼이 없어 본문 첫 마크다운 헤딩을 쓴다(splitContent). 없으면 요약만.
 * - 카드뉴스 인라인 덱(좌우 넘김): 피드 응답에 대표컷 1장만 와서 장수를 모른다 —
 *   CARD NEWS 라벨을 얹은 정사각 대표컷으로 대체하고, 넘김은 상세 캐러셀에서.
 */
export default function PostCard({ post }: { post: FeedItem }) {
  const [isLikesOpen, setLikesOpen] = useState(false)
  const { mutate: toggleLike, isPending: isToggling } = useToggleLike()
  // 커버는 서버가 내려준 대표컷 1장 — 프로젝트는 썸네일, 카드뉴스는 첫 장 폴백(서버 COALESCE).
  const cover = post.thumbnail_url ?? null
  const { title, body } = splitContent(post.content)
  // 코드 블록·이미지만으로 이뤄진 글은 발췌가 빈 문자열이 된다 — 제목마저 없으면 대체 문구.
  const excerpt = toExcerpt(body)

  return (
    <article className="border-line border-b pt-[34px] pb-[14px]">
      {/* 작성자 영역 → 프로필 (screens.md 이동 맵). 시각은 링크 밖. */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/users/${post.author.user_id}`}
          className="flex min-w-0 items-center gap-3"
        >
          <UserAvatar user={post.author} className="h-12 w-12" />
          <span className="text-ink truncate text-[15px] font-semibold">
            {displayNickname(post.author)}
          </span>
        </Link>
        <span className="text-ink/[.52] text-[13px] tabular-nums">
          ·{' '}
          <time dateTime={post.created_at}>{formatRelativeTime(post.created_at)}</time>
        </span>
      </div>

      {title && (
        <h3 className="text-ink mt-4 mb-2 text-[27px] leading-snug font-bold tracking-[-0.015em] break-keep">
          <Link to={`/posts/${post.post_id}`}>{title}</Link>
        </h3>
      )}

      <p
        className={`${title ? '' : 'mt-4 '}line-clamp-3 text-[15.5px] leading-[1.7] break-keep ${
          excerpt ? 'text-ink/[.66]' : 'text-ink-subtle'
        }`}
      >
        {excerpt || (title ? '' : '본문 미리보기가 없는 글입니다.')}
      </p>

      {/* 프로젝트든 카드뉴스든 같은 1:1 액자다(시안 PostThumb) — 유형이 다르다고 대표컷
          크기가 달라지면 피드를 훑을 때 리듬이 끊긴다. 카드뉴스 좌측 상단에 CARD NEWS
          배지는 두지 않는다 — 검은 반투명 배지가 첫 장 위를 덮어 정작 봐야 할 카드 내용을
          가린다(시안은 라벨이 카드 그림 안에 들어 있다). */}
      {cover && (
        <CoverPlate
          to={`/posts/${post.post_id}`}
          label={
            post.post_type === 'PROJECT'
              ? `${title ?? '프로젝트'} 상세 열기`
              : `${title ?? '카드뉴스'} 열기`
          }
          cover={cover}
        />
      )}

      {/* 액션 — 시안대로 우하단 정렬. 좋아요·댓글 버튼은 카드 링크 밖이라 클릭이 새지 않는다. */}
      <div className="mt-[14px] flex items-center justify-end">
        <div className="flex gap-0.5">
          <span className="inline-flex items-center">
            <button
              type="button"
              onClick={() => toggleLike(post.post_id)}
              disabled={isToggling}
              aria-pressed={post.is_liked}
              aria-label={post.is_liked ? '좋아요 취소' : '좋아요'}
              className={[
                'inline-flex items-center rounded-[10px] py-[7px] pr-[5px] pl-[11px] transition-colors',
                post.is_liked ? 'text-danger' : 'text-ink/[.6] hover:text-danger',
              ].join(' ')}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill={post.is_liked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.05 3 5.5l7 7Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setLikesOpen(true)}
              aria-label={`좋아요 ${post.like_count}명 보기`}
              className={[
                'rounded-[10px] px-2.5 py-[7px] text-[13.5px] tabular-nums transition-colors',
                post.is_liked ? 'text-danger' : 'text-ink/[.6] hover:text-ink',
              ].join(' ')}
            >
              {post.like_count}
            </button>
          </span>
          {/* 댓글은 좋아요와 달리 모달이 아니라 상세로 보낸다 — 상세 우측 패널이 본문과
              댓글을 같이 보여줘서, 목록만 따로 띄우면 맥락 없이 댓글만 읽게 된다. */}
          <Link
            to={`/posts/${post.post_id}`}
            aria-label={`댓글 ${post.comment_count}개 보기`}
            className="text-ink/[.6] hover:text-ink inline-flex items-center gap-[7px] rounded-[10px] px-[11px] py-[7px] text-[13.5px] tabular-nums transition-colors"
          >
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
            <span>{post.comment_count}</span>
          </Link>
        </div>
      </div>

      {isLikesOpen && (
        <LikeListModal postId={post.post_id} onClose={() => setLikesOpen(false)} />
      )}
    </article>
  )
}

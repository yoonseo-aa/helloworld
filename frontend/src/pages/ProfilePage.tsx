import { useState, type CSSProperties } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { useAuthStore } from '@/stores/useAuthStore'
import {
  useFollowerCount,
  useFollowingCount,
  useFollowStatus,
  useGithubSectionVisible,
  useProfileAchievements,
  useUserGithub,
  useUserPosts,
  useUserProfile,
} from '@/features/profile/hooks'
import { useProfileIntro } from '@/features/profile/useProfileIntro'
import type { ProfileResponse } from '@/features/profile/types'
import FollowButton from '@/features/profile/components/FollowButton'
import StartChatButton from '@/features/chat/components/StartChatButton'
import GithubSummary from '@/features/profile/components/GithubSummary'
import AchievementBadges from '@/features/profile/components/AchievementBadges'
import TechStackRow from '@/features/profile/components/TechStackRow'
import PostComposerModal from '@/features/feed/components/PostComposerModal'
import { useGithubConnectResult } from '@/features/profile/useGithubConnectResult'
// 섹션·구분선·타일 등장 키프레임(hw-secin / hw-lin / hw-cellgrow).
import '@/features/profile/profile.css'
import { toRouteId } from '@/hooks/routeId'

/**
 * 프로필 — 시안(`프로필-화면-명세.md`, handoff ProfilePage) 골격 그대로.
 *
 * 화면은 위에서 아래로 세 덩이다:
 *   1. 프로필 정보 — 아바타 · 이름 줄 · 통계 · 소개 · 기술 스택 · 업적 배지 · 팔로우/메시지
 *   2. 구분선 + GitHub 활동(성장 초원)
 *   3. 구분선 + 게시글 3열 그리드
 * 2·3번은 진입 애니메이션(useProfileIntro의 `revealSec`)이 1350ms·1910ms에 차례로 연다.
 * 명세 2절의 요소 **순서는 고정**이고, 기술 스택 행과 업적 행은 같은 실측 폭을 나눠 써야
 * 오른쪽 끝이 맞는다(row-fit.ts) — 그래서 폭 측정 박스를 페이지가 들고 있다.
 *
 * 내 프로필과 타인 프로필이 같은 라우트를 쓴다 — userId가 내 ID면 '프로필 편집',
 * 아니면 '팔로우/메시지 보내기'를 노출한다. 사이드바 '프로필'은 /users/me로 보내고,
 * 여기서 'me'를 로그인한 내 user_id로 해석한다.
 *
 * GitHub 연동 진입점은 이 화면 하나뿐이다 — 미연동이면 GithubSummary가 잔디·초원이 들어갈
 * 자리에 안내와 연동 버튼을 띄운다. (가입 직후 연동을 강제하던 /settings/github 단계는
 * 없앴다. 연동은 선택이고, 안 해도 이 자리에서 언제든 할 수 있다.)
 * 백엔드가 OAuth 왕복을 끝내고 ?github=... 를 붙여 돌려보내며, 결과 토스트는
 * useGithubConnectResult가 띄운다(이 페이지가 복귀 지점이라 여기서 훅을 건다).
 *
 * <Outlet />은 팔로워/팔로잉 목록 모달 자리다. 이 페이지가 마운트된 채로 모달만 얹힌다.
 */
export default function ProfilePage() {
  useGithubConnectResult()
  const { userId: rawUserId } = useParams()
  const myUserId = useAuthStore((state) => state.userId)
  const userId = rawUserId === 'me' ? (myUserId ?? undefined) : toRouteId(rawUserId)
  const isOwnProfile = myUserId !== null && userId === myUserId

  const { data: profile, isPending, isError } = useUserProfile(userId)

  return (
    <>
      {/* 명세 1절 main: max-width 1120 / 데스크톱 40px 32px 130px, 모바일 26px 16px 118px.
          하단 여백이 큰 건 모바일 탭바(58px)와 시안의 스크롤 여유를 함께 비운 값이다.
          잔디·초원 캔버스는 1600×340 고정 비율(패딩 21.25%)이라 세로가 폭에 따라 정해진다 —
          즉 시각화를 키우는 방법은 이 컨테이너를 넓히는 것뿐이다(비율을 바꾸면 그림이 잘린다). */}
      <div className="mx-auto max-w-[1120px] px-4 pt-[26px] pb-[118px] md:px-8 md:pt-10 md:pb-[130px]">
        {isPending && <p className="text-ink-muted text-sm">불러오는 중...</p>}
        {isError && <p className="text-ink-muted text-sm">프로필을 불러오지 못했습니다.</p>}

        {profile && userId !== undefined && (
          // key로 유저가 바뀔 때 통째로 리마운트한다 — 시안처럼 인트로와 초원 성장이
          // 페이지 이동마다 처음부터 다시 흐르게.
          <ProfileView
            key={userId}
            userId={userId}
            rawUserId={rawUserId ?? String(userId)}
            profile={profile}
            isOwnProfile={isOwnProfile}
          />
        )}
      </div>

      <Outlet />
    </>
  )
}

/** 게시글 타일에 찍는 종류 라벨 — 시안의 mono 라벨 자리를 우리 데이터(post_type)로 채운다. */
const POST_TYPE_LABEL: Record<string, string> = {
  PROJECT: 'PROJECT',
  CARD_NEWS: 'CARD NEWS',
}

function ProfileView({
  userId,
  rawUserId,
  profile,
  isOwnProfile,
}: {
  userId: number
  /** URL에 있던 원본 값('me'일 수 있다) — 모달 링크가 주소를 그대로 이어받게 쓴다. */
  rawUserId: string
  profile: ProfileResponse
  isOwnProfile: boolean
}) {
  const [isComposerOpen, setComposerOpen] = useState(false)

  const { data: followerCount } = useFollowerCount(userId)
  const { data: followingCount } = useFollowingCount(userId)
  // '메시지 보내기'는 내가 이 사람을 팔로우 중일 때만 연다(아래 6번). FollowButton도 같은
  // 쿼리를 구독하므로 키가 같아 요청은 하나로 합쳐진다 — 여기서 부른다고 호출이 늘지 않는다.
  const { data: followStatus } = useFollowStatus(userId, !isOwnProfile)
  const { data: github } = useUserGithub(userId)
  const achievements = useProfileAchievements(userId)
  const githubSectionVisible = useGithubSectionVisible(userId)

  const {
    data: postsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: isPostsPending,
  } = useUserPosts(userId)
  const posts = postsData?.pages.flatMap((page) => page.items) ?? []
  // 그리드 무한 스크롤 센티널 — 뷰포트에 들어오면 다음 15개(5줄)를 받는다.
  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  })

  // 진입 애니메이션. 접힌 배지 수가 `+N` 카운트업의 목표치라 업적 개수를 넘긴다.
  const { intro, moreN, revealSec, reduce, rowW, rowRef } = useProfileIntro(
    achievements.length,
  )

  const displayName = profile.nickname ?? '닉네임 미설정'
  const avatarInitial = (profile.nickname ?? profile.email ?? '?').charAt(0)
  // 무한 스크롤이라 "지금까지 받아온 수"만 안다 — 아직 남았으면 '+'를 붙여 확정 수가
  // 아님을 드러낸다. TODO(api): 프로필 응답에 총 게시글 수 필드가 생기면 그 값으로 바꾼다.
  const postCountLabel = `${posts.length}${hasNextPage ? '+' : ''}`

  // 명세 5.1 섹션 등장 — 미도달이면 숨겨 두고, 도달하는 순간 키프레임으로 올린다.
  // 감속 모션이면 아예 최종 상태로 둔다(명세 5.4).
  const secIn = (on: boolean): CSSProperties =>
    reduce
      ? {}
      : on
        ? { animation: 'hw-secin .62s cubic-bezier(.2,.85,.28,1) .18s both' }
        : { opacity: 0, transform: 'translateY(16px)' }
  const divIn = (on: boolean): CSSProperties => ({
    height: 1,
    background: 'var(--color-line)',
    margin: '26px 0',
    transformOrigin: '50% 50%',
    ...(reduce
      ? {}
      : on
        ? { animation: 'hw-lin .32s cubic-bezier(.3,.85,.25,1) both' }
        : { transform: 'scaleX(0)' }),
  })

  return (
    <>
      {!isOwnProfile && (
        <Link
          to="/users/me"
          className="border-line text-ink/60 hover:border-brand hover:text-brand-strong mb-[18px] inline-flex min-h-9 items-center gap-2 rounded-full border py-0 pr-[13px] pl-2.5 text-[13px] transition-colors"
        >
          <ChevronLeftIcon />
          내 프로필로 돌아가기
        </Link>
      )}

      {/* ── 1. 프로필 정보 (명세 2절 — 요소 순서 고정) ─────────────────────── */}
      <section
        aria-label="프로필 정보"
        className="flex flex-wrap items-start gap-[18px] md:items-center md:gap-[30px]"
      >
        {profile.profile_image_url ? (
          <img
            src={profile.profile_image_url}
            alt={`${displayName} 프로필 이미지`}
            className="border-line h-[76px] w-[76px] flex-none rounded-full border object-cover md:h-24 md:w-24"
          />
        ) : (
          // 시안은 이니셜 아바타만 있다 — 우리는 이미지 업로드가 있으므로 없을 때의 폴백으로 쓴다.
          // 색은 시안(accent-100/accent-700)이 아니라 공용 UserAvatar의 중립색을 따른다 —
          // 이니셜 폴백은 서비스 전체에서 한 가지 색이어야 한다(주황 틴트 금지, 78cbd44).
          <div className="border-line bg-surface-sunken text-ink flex h-[76px] w-[76px] flex-none items-center justify-center rounded-full border text-[30px] font-bold md:h-24 md:w-24 md:text-[38px]">
            {avatarInitial}
          </div>
        )}

        <div className="min-w-[260px] flex-1">
          {/* 1. 이름 줄 */}
          <div className="flex flex-wrap items-center gap-[14px]">
            <h1 className="text-ink m-0 text-[26px] font-bold tracking-[-0.015em]">
              {displayName}
            </h1>
            {/* 순서: 이름 → 프로필 편집 → GitHub 계정.
                편집 버튼을 이름 바로 옆에 붙여 둔다 — 내 프로필에서 가장 자주 누르는
                버튼이라 이름에서 눈을 옮기지 않고 닿는 자리가 맞다. GitHub 칩은 읽기
                전용 정보라 그 뒤로 물린다. */}
            {isOwnProfile && (
              <Link
                to="/settings/profile"
                className="border-line text-ink hover:bg-ink/[.07] active:bg-ink/[.14] inline-flex min-h-[38px] items-center rounded-md border px-4 text-[13.5px] font-bold transition-colors"
              >
                프로필 편집
              </Link>
            )}
            {/* 시안의 `@handle` 칩. 우리 계정엔 핸들이 없어 GitHub 로그인명이 그 자리를
                채운다 — 미연동이면 칩 자체를 그리지 않는다. */}
            {github && (
              <span className="border-line text-ink/[.62] font-mono inline-flex items-center gap-[7px] rounded-full border px-3 py-[5px] text-[11.5px]">
                <GithubMarkIcon />@{github.github_login}
                <span aria-hidden className="bg-brand h-1.5 w-1.5 rounded-full" />
              </span>
            )}
            {/* 연동 버튼은 여기 두지 않는다. 미연동일 때 GithubSummary가 잔디·초원이 들어갈
                자리에 안내와 함께 버튼을 보여주므로, 상단에도 두면 같은 버튼이 한 화면에
                두 번 나온다. */}
          </div>

          {/* 2. 통계 줄 */}
          <div className="mt-[14px] flex flex-wrap gap-[22px] text-[14.5px]">
            <span className="tabular-nums">
              <b className="font-bold">{postCountLabel}</b>{' '}
              <span className="text-ink/60">게시글</span>
            </span>
            <Link
              to={`/users/${rawUserId}/followers`}
              className="group hover:text-brand-hover tabular-nums transition-colors"
            >
              <b className="font-bold">{(followerCount ?? 0).toLocaleString()}</b>{' '}
              <span className="text-ink/60 transition-colors group-hover:text-brand-hover">
                팔로워
              </span>
            </Link>
            <Link
              to={`/users/${rawUserId}/following`}
              className="group hover:text-brand-hover tabular-nums transition-colors"
            >
              <b className="font-bold">{(followingCount ?? 0).toLocaleString()}</b>{' '}
              <span className="text-ink/60 transition-colors group-hover:text-brand-hover">
                팔로잉
              </span>
            </Link>
          </div>

          {/* 3. 소개 — 비어 있어도 **한 줄 자리는 남긴다**(min-h).
              예전엔 소개가 없으면 이 문단을 통째로 안 그려서, 아래 기술 스택·배지가
              37px쯤 위로 올라붙었다. 그러면 소개를 쓰는 순간 배지가 아래로 밀리고,
              남의 프로필을 오갈 때도 같은 자리의 배지가 사람마다 다른 높이에 있었다.
              높이 25.375px = 글자 14.5px × 행간 1.75 (아래 문단과 같은 값). */}
          <p className="text-ink/[.72] mt-3 max-w-[520px] min-h-[25.375px] text-[14.5px] leading-[1.75] break-keep">
            {profile.introduce}
          </p>

          {/* 4. 기술 스택 — 이 박스가 폭 측정 대상이다. 태그 행과 배지 행이 같은 폭을
              봐야 두 줄의 오른쪽 끝이 맞는다(명세 4절). 기술 스택이 없어 TechStackRow가
              null을 돌려주면 `empty:mt-0`이 위쪽 여백까지 같이 접는다. */}
          <div ref={rowRef} className="mt-5 max-w-[520px] empty:mt-0">
            <TechStackRow userId={userId} rowW={rowW} reduce={reduce} />
          </div>

          {/* 5. 업적 배지 */}
          <AchievementBadges
            ach={achievements}
            rowW={rowW}
            intro={intro}
            moreN={moreN}
            reduce={reduce}
          />

          {/* 6. 팔로우/메시지 — 타 유저 프로필에서만.
              '메시지 보내기'는 **내가 이 사람을 팔로우 중일 때만** 나온다(맞팔은 아니다 —
              상대가 나를 팔로우하는지는 보지 않는다).

              메시지 버튼이 없어도 2열 그리드는 그대로 두고 오른쪽 칸을 비운다. 1열로
              접으면 팔로우 버튼이 520px을 혼자 다 먹어서, 팔로우한 뒤의 '팔로잉' 버튼과
              크기가 달라진다 — 토글할 때마다 버튼이 늘었다 줄었다 한다.

              상태를 모르는 동안(조회 중)에는 감춘 쪽으로 둔다 — 없던 버튼이 뒤늦게
              생기는 편이, 있던 버튼이 사라지는 것보다 덜 거슬린다. 토글 직후에도
              서버가 확정해 준 뒤에 열린다(FollowButton의 낙관적 표시는 라벨에만 걸려
              있고, 실패할 수 있는 버튼을 미리 띄우지 않으려는 의도다). */}
          {!isOwnProfile && (
            <div className="mt-[22px] grid max-w-[520px] grid-cols-2 gap-2.5">
              <FollowButton userId={userId} variant="hero" />
              {followStatus?.is_following && (
                <StartChatButton userId={userId} variant="hero" />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. GitHub 활동 (revealSec 1) ──────────────────────────────────
          섹션이 아무것도 안 그리는 경우엔 구분선도 같이 뺀다 — 안 그러면 선 두 줄이
          26px 간격으로 나란히 남는다. */}
      {githubSectionVisible && (
        <>
          <div aria-hidden style={divIn(revealSec >= 1)} />
          <div style={secIn(revealSec >= 1)}>
            <GithubSummary
              userId={userId}
              isOwnProfile={isOwnProfile}
              active={revealSec >= 1}
            />
          </div>
        </>
      )}

      {/* ── 3. 게시글 그리드 (revealSec 2) ────────────────────────────────── */}
      <div aria-hidden style={divIn(revealSec >= 2)} />
      <section aria-label="게시글" style={secIn(revealSec >= 2)}>
        <div className="mb-4 flex flex-wrap items-baseline gap-[14px]">
          <h2 className="text-ink m-0 text-[17px] font-bold tracking-[-0.01em]">게시글</h2>
          <span className="text-ink/[.48] font-mono text-[10.5px] tracking-[0.14em]">
            {postCountLabel} POSTS
          </span>
        </div>

        {posts.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post, i) => (
              <Link
                key={post.post_id}
                to={`/posts/${post.post_id}`}
                aria-label={`${POST_TYPE_LABEL[post.post_type] ?? '게시글'} 상세 보기`}
                className="group border-line bg-surface-muted relative flex aspect-square items-center justify-center overflow-hidden border"
                style={
                  reduce
                    ? undefined
                    : {
                        animation: `hw-cellgrow .46s cubic-bezier(.2,.8,.25,1) ${46 + i * 46}ms both`,
                      }
                }
              >
                {post.thumbnail_url ? (
                  <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <span aria-hidden className="text-ink/40 font-mono text-[22px]">
                      {post.post_type === 'CARD_NEWS' ? '▤' : '◇'}
                    </span>
                    <span
                      aria-hidden
                      className="text-ink/40 font-mono absolute bottom-2 left-2.5 text-[10px] tracking-[0.1em]"
                    >
                      {POST_TYPE_LABEL[post.post_type]}
                    </span>
                  </>
                )}
                {/* hover 오버레이. 시안은 여기에 좋아요·댓글 수를 띄우는데 프로필 게시글
                    목록 응답엔 두 수치가 없다 — TODO(api): like_count·comment_count 추가되면 교체. */}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#17181b]/[.58] font-mono text-[12.5px] tracking-[0.08em] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {POST_TYPE_LABEL[post.post_type]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          !isPostsPending && (
            <div className="flex flex-col items-center px-5 pt-14 pb-[26px] text-center">
              <span className="border-line-strong bg-surface text-ink/50 flex h-16 w-16 items-center justify-center rounded-full border">
                <GridIcon />
              </span>
              <h3 className="text-ink mt-[22px] text-[19px] font-bold">
                아직 게시글이 없어요
              </h3>
              <p className="text-ink/[.64] mt-[9px] max-w-[320px] text-[14px] leading-[1.7] break-keep">
                프로젝트나 카드뉴스를 올리면 이 그리드가 채워져요.
              </p>
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="border-line-strong text-ink hover:bg-ink/5 mt-[22px] inline-flex min-h-[44px] items-center rounded-md border px-[18px] text-[14px] transition-colors"
                >
                  첫 게시글 작성하기
                </button>
              )}
            </div>
          )
        )}

        <div ref={sentinelRef} aria-hidden className="h-px" />
        {isFetchingNextPage && (
          <p className="text-ink-subtle py-3 text-center text-sm">더 불러오는 중...</p>
        )}
      </section>

      {isComposerOpen && <PostComposerModal onClose={() => setComposerOpen(false)} />}
    </>
  )
}

/* ── 이 화면에서만 쓰는 인라인 아이콘 ─────────────────────────────────────
   공용 icons.tsx로 올리지 않는다 — CLAUDE.md 배치 규칙대로 두 번째 사용처가 생기면 승격. */

function ChevronLeftIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

/** GitHub Invertocat — 핸들 칩 안의 13px 마크. */
function GithubMarkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

/** 게시글 빈 상태의 그리드 아이콘. */
function GridIcon() {
  return (
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
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

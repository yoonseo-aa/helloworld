import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { useLogout } from '@/features/auth/hooks'
import { useStompConnectionStatus } from '@/socket/stompClient'
import { useBadgeStore } from '@/stores/useBadgeStore'
import { formatUnreadCount } from '@/features/chat/format'
import PostComposerModal from '@/features/feed/components/PostComposerModal'
import SearchBar from '@/features/search/components/SearchBar'
import { BrandMark, Home, Bell, Send, Heart, User, SquarePlus, LogOut } from './icons'
import ThemeToggle from './ThemeToggle'

/**
 * 로그인 후 화면들의 공통 셸 — 시안(front.zip handoff AppShell) 이식.
 * 데스크톱: 좌측 고정 아이콘 레일(80px, 타일 52px, hover 시 라벨 툴팁) + 콘텐츠 오프셋 200px.
 * 모바일(<768): 상단 헤더(브랜드·검색·로그아웃) + 하단 탭바(58px).
 * 검색바는 전 화면 공통으로 스티키 헤더 중앙에 둔다 (시안 Header).
 *
 * 시안과 다른 점:
 * - DM 뱃지는 알림이 아니라 채팅 타일에 붙는다 — 우리 useBadgeStore가 DM 카운트라서.
 *   (알림 뱃지는 알림 백엔드가 생기면 같은 자리에 추가)
 * - 작성 진입점: 시안은 ?compose=1 쿼리(TODO(team) 표시)지만, 우리는 확정돼 있던
 *   "URL 없는 모달" 방식 유지 (작성 중 내용이 뒤로가기로 날아가지 않게).
 *   모바일은 시안 screens.md대로 탭바에 '작성' 버튼을 넣었다(AppShell엔 없어 6칸으로 확장).
 * - 테마 토글 FAB: 다크 모드 도입과 함께 별도 작업 (index.css 주석).
 */

const NAV = [
  { to: '/', label: '홈', short: '홈', end: true, Icon: Home },
  { to: '/notifications', label: '알림', short: '알림', end: false, Icon: Bell },
  { to: '/chat', label: '대화', short: '대화', end: false, Icon: Send },
  { to: '/likes', label: '좋아요 목록', short: '좋아요', end: false, Icon: Heart },
  { to: '/users/me', label: '프로필', short: '프로필', end: false, Icon: User },
]

/** 레일 타일 hover/focus 라벨 툴팁 (시안 label — bg neutral-900, 좌측 60px). */
function TileLabel({ text }: { text: string }) {
  return (
    <span className="bg-ink text-surface pointer-events-none absolute top-1/2 left-[60px] z-[70] hidden -translate-y-1/2 rounded-[10px] px-3 py-[7px] text-[13px] font-semibold tracking-[-0.01em] whitespace-nowrap shadow-md group-hover:block group-focus-visible:block">
      {text}
    </span>
  )
}

const TILE =
  'group relative ml-[14px] flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[10px] transition-colors'

/**
 * 스크롤 위치를 저장·복원할 때 쓰는 키.
 *
 * 기본값(location.key)은 히스토리 항목마다 자리를 따로 기억한다. 그런데 이 앱의 일부
 * 라우트는 **부모 화면 위에 얹히는 모달**이다(게시글 상세 = '/'의 자식, 팔로워 목록 =
 * 프로필의 자식). 그런 경로로 이동할 때 기본 규칙을 따르면 "새 화면"으로 보고 뒤 화면을
 * 맨 위로 올려 버려서, 모달을 닫으면 읽던 자리가 사라진다.
 * 그래서 모달 경로는 부모 경로의 키를 그대로 쓰게 접어 준다.
 *
 * 나머지는 경로 자체를 키로 쓴다 — 같은 화면으로 돌아오면 마지막에 보던 자리를 되찾는다.
 */
function scrollRestorationKey(location: Location): string {
  const { pathname } = location
  // 게시글 상세는 피드 위에 뜨는 모달이다.
  if (pathname.startsWith('/posts/')) return '/'
  // 팔로워·팔로잉 목록은 프로필 위에 뜨는 모달이다.
  const followList = pathname.match(/^(\/users\/[^/]+)\/(?:followers|following)$/)
  if (followList) return followList[1]
  return pathname
}

export default function AppLayout() {
  const [isComposerOpen, setComposerOpen] = useState(false)
  // 로그아웃은 셸에 둔다 (계정 설정 화면은 만들지 않기로 확정)
  const { mutate: logout, isPending: isLoggingOut } = useLogout()
  const socketStatus = useStompConnectionStatus()
  const dmUnreadCount = useBadgeStore((state) => state.dmUnreadCount)
  const notificationUnreadCount = useBadgeStore(
    (state) => state.notificationUnreadCount,
  )
  /** 타일별 뱃지 숫자 — 뱃지가 붙는 곳이 늘어도 렌더 쪽 분기는 이 함수 하나로 끝난다. */
  const badgeCountOf = (to: string) =>
    to === '/chat'
      ? dmUnreadCount
      : to === '/notifications'
        ? notificationUnreadCount
        : 0

  return (
    <div className="min-h-svh">
      {/*
        화면을 옮기면 스크롤을 맨 위로, 뒤로가기로 돌아오면 있던 자리로 되돌린다.
        v7 데이터 라우터는 이걸 자동으로 해주지 않아서 직접 렌더해야 한다 — 없는 동안은
        피드를 3000px 내려 읽다가 작성자 프로필로 들어가면 그 화면도 3000px 지점에서 시작했다.
      */}
      <ScrollRestoration getKey={scrollRestorationKey} />
      {/* 재연결 5회 실패 — 명세 문구 그대로. */}
      {socketStatus === 'failed' && (
        <div className="bg-danger fixed inset-x-0 top-0 z-[90] px-4 py-2 text-center text-sm text-white">
          연결에 실패했습니다. 새로고침 해주세요.
        </div>
      )}

      {/* 데스크톱 아이콘 레일 */}
      <aside className="bg-surface-muted fixed top-0 bottom-0 left-0 z-50 hidden w-20 flex-col items-start pt-[18px] pb-[22px] md:flex">
        {/* 브랜드 마크 — 클릭하면 홈으로 가되, 시안대로 hover 배경·라벨 툴팁은 붙이지 않는다
            (레일 타일이 아니라 로고 자리라 hover 반응 없이 조용히 둔다). */}
        <Link to="/" aria-label="홈으로 이동" className={`${TILE} text-ink`}>
          <BrandMark size={26} />
        </Link>

        <nav aria-label="주 메뉴" className="mt-[22px] flex flex-col items-start gap-1.5">
          {NAV.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  TILE,
                  isActive
                    ? 'text-brand-strong'
                    : 'text-ink/[.55] hover:bg-ink/5 hover:text-ink',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative inline-flex flex-none">
                    {/* 현재 위치면 아이콘이 주황으로 채워진다 (icons.tsx activeFill). */}
                    <Icon active={isActive} />
                    {badgeCountOf(to) > 0 && (
                      <span
                        aria-hidden
                        className="bg-brand-hover absolute -top-[5px] -right-[7px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 font-mono text-[9.5px] leading-none text-white tabular-nums"
                      >
                        {formatUnreadCount(badgeCountOf(to))}
                      </span>
                    )}
                  </span>
                  <TileLabel text={label} />
                </>
              )}
            </NavLink>
          ))}
          {/* 게시물 작성은 URL 없이 모달로 연다 (작성 중 내용이 뒤로가기로 날아가지 않게).
              다른 타일과 달리 활성 채움을 하지 않는다 — 머무는 자리가 아니라 여는 동작이다. */}
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className={`${TILE} text-ink/[.55] hover:bg-ink/5 hover:text-ink`}
          >
            <SquarePlus />
            <TileLabel text="게시글 작성" />
          </button>
        </nav>

        <div className="mt-auto flex flex-col items-start">
          <button
            type="button"
            aria-label="로그아웃"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className={`${TILE} text-ink/[.55] hover:bg-ink/5 hover:text-ink disabled:opacity-50`}
          >
            <LogOut size={24} />
            <TileLabel text={isLoggingOut ? '로그아웃 중...' : '로그아웃'} />
          </button>
        </div>
      </aside>

      <div className="pb-[76px] md:ml-[200px] md:pb-12">
        {/* 스티키 헤더 — 중앙 검색(전 화면 공통), 모바일은 브랜드·로그아웃 포함 */}
        <header className="border-line bg-surface-muted/[.88] sticky top-0 z-40 flex h-[60px] items-center gap-2.5 border-b px-4 backdrop-blur-[10px] md:h-[66px] md:gap-5 md:px-8">
          {/* 모바일 브랜드 마크도 홈 링크 (레일 브랜드 마크와 동일 동작). */}
          <Link
            to="/"
            aria-label="홈으로 이동"
            className="text-ink -ml-2 flex h-10 w-10 flex-none items-center justify-center rounded-[10px] md:hidden"
          >
            <BrandMark size={24} />
          </Link>
          <div className="min-w-0 flex-1 md:mx-auto md:max-w-[520px]">
            <SearchBar />
          </div>
          <button
            type="button"
            aria-label="로그아웃"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="text-ink/[.58] -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-[10px] disabled:opacity-50 md:hidden"
          >
            <LogOut size={21} />
          </button>
        </header>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>

      {/* 모바일 하단 탭바 */}
      <nav
        aria-label="모바일 메뉴"
        className="border-line bg-surface-muted/[.94] fixed inset-x-0 bottom-0 z-[60] grid grid-cols-6 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px] md:hidden"
      >
        {NAV.map(({ to, short, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px]',
                isActive ? 'text-brand-strong font-semibold' : 'text-ink/[.6]',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative inline-flex">
                  <Icon active={isActive} />
                  {badgeCountOf(to) > 0 && (
                    <span
                      aria-hidden
                      className="bg-brand-hover absolute -top-[3px] -right-[7px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none text-white tabular-nums"
                    >
                      {formatUnreadCount(badgeCountOf(to))}
                    </span>
                  )}
                </span>
                {short}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="text-ink/[.6] flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10.5px]"
        >
          <SquarePlus />
          작성
        </button>
      </nav>

      {/* 테마 토글 — 시안대로 우하단 플로팅. 셸 안이라 모바일 탭바 위로 띄운다. */}
      <ThemeToggle aboveTabBar />

      {isComposerOpen && <PostComposerModal onClose={() => setComposerOpen(false)} />}
    </div>
  )
}

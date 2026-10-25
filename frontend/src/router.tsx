import { createBrowserRouter } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/RouteGuards'
import FollowListModal from '@/features/profile/components/FollowListModal'

import ErrorPage from '@/pages/ErrorPage'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import PasswordResetPage from '@/pages/PasswordResetPage'
import OAuthCallbackPage from '@/pages/OAuthCallbackPage'
import FeedPage from '@/pages/FeedPage'
import PostDetailPage from '@/pages/PostDetailPage'
import LikedPostsPage from '@/pages/LikedPostsPage'
import SearchPage from '@/pages/SearchPage'
import ProfilePage from '@/pages/ProfilePage'
import ProfileSettingsPage from '@/pages/ProfileSettingsPage'
import ChatListPage from '@/pages/ChatListPage'
import ChatEmptyState from '@/pages/ChatEmptyState'
import ChatRoomPage from '@/pages/ChatRoomPage'
import NotificationsPage from '@/pages/NotificationsPage'
import NotFoundPage from '@/pages/NotFoundPage'

/**
 * 화면 URL 정의.
 *
 * API 엔드포인트와는 다른 층이다 — 여기 있는 주소는 사용자가 주소창에서 보고 공유하는 것이고,
 * `/api/...`는 그 화면이 데이터를 받으려고 부르는 주소다. 배포 시 nginx가 `/api` 접두어로 둘을 가른다.
 * 리소스 이름(posts/users/chat)만 API와 맞춰 대응이 눈에 보이게 했다.
 *
 * 결정 사항:
 *  - 내 프로필도 /users/:userId를 쓴다. 사이드바는 /users/me로 보내고 ProfilePage가 'me'를 내 ID로 해석한다.
 *  - 게시물 작성 모달에는 URL을 주지 않는다 (뒤로가기로 작성 중 내용이 날아가는 게 더 나쁨).
 *  - 팔로워/팔로잉 모달은 자식 라우트다 — 프로필이 마운트된 채로 위에 얹히고, 뒤로가기로 닫힌다.
 *  - 게시글 상세도 같은 패턴의 자식 라우트다. 어디서 진입하든(피드 클릭·검색·프로필·URL 직접)
 *    피드 위 모달로 열린다 — v7 데이터 라우터는 background-location 이중 렌더를 지원하지
 *    않아 "직접 진입은 단독 페이지" 분기를 접고 모달로 통일했다 (2026-08-03 합의).
 *  - 최상위에 경로 없는 라우트 하나를 두고 errorElement를 건다. 아래 모든 라우트의
 *    렌더 에러가 여기로 모인다 (경로가 없는 라우트는 element 없이 자식만 그린다).
 *  - 채팅(/chat)은 목록+대화 2단 레이아웃 자식 라우트다 — ChatListPage가 좌측 목록을
 *    고정으로 띄우고, 방을 고르기 전엔 ChatEmptyState, 고르면 ChatRoomPage가 우측
 *    Outlet에 들어간다 (2026-08-03 합의).
 */
export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: [
      /*
       * OAuth 콜백은 어느 가드에도 넣지 않는다 (중립지대).
       *
       * PublicOnlyRoute 안에 두면 안 된다: 이 화면은 인가 코드를 백엔드로 넘겨 토큰을
       * 받은 뒤 is_new에 따라 /settings/profile 또는 /로 보내는 게 일인데, signIn()으로
       * accessToken이 생기는 순간 가드의 반사적 이동(location.state.redirectTo 기준)이
       * is_new 분기와 경합해 엉뚱한 곳으로 튕기는 문제가 실제로 있었다.
       * LoginForm·SignupForm은 location.state.redirectTo를 미리 심어 이 경합을 피하지만,
       * 콜백은 구글에서 외부 리다이렉트로 들어와 state가 비어 있어 같은 수를 못 쓴다.
       * ProtectedRoute도 아니다 — 토큰을 받으러 온 화면이라 아직 미인증이 정상이다.
       */
      { path: '/oauth/callback/google', element: <OAuthCallbackPage /> },

      /*
       * 비밀번호 재설정도 중립지대다.
       *
       * PublicOnlyRoute 안에 있을 때 문제가 있었다: 이 화면은 ?token= 유무로 "재설정 요청"과
       * "새 비밀번호 확정"을 가르는데, 가드는 accessToken이 있으면 쿼리스트링을 보지 않고
       * 무조건 redirectTo(기본 '/')로 보낸다. 새로고침 시 bootstrapAuth가 HttpOnly refresh
       * 쿠키로 silent refresh에 성공하면 로그인 세션이 살아 있는 셈이라, 메일로 받은
       * /password/reset?token=... 링크가 아무 안내 없이 피드로 튕기고 주소창의 token도
       * 사라졌다. 사용자는 링크가 깨진 줄 알고 재발송만 반복하게 된다.
       *
       * ProtectedRoute도 아니다 — 비밀번호를 잊은 사람이 오는 화면이라 미인증이 정상이다.
       */
      { path: '/password/reset', element: <PasswordResetPage /> },

      {
        element: <PublicOnlyRoute />,
        children: [
          /*
           * 인트로 랜딩. 라우트로 둔 것이 요점이다 — 자기 히스토리 엔트리를 가져야
           * 로그인 화면에서 뒤로가기를 눌렀을 때 여기로 돌아온다.
           *
           * 이 주소를 직접 열면 "이미 봤는지"를 따지지 않고 항상 인트로를 보여준다.
           * 판정은 메인(/)에서 여기로 보낼지 말지를 정하는 ProtectedRoute 한 곳에만 있다.
           * 여기서도 또 따지면 뒤로가기로 돌아왔을 때 빈 화면이 된다.
           */
          { path: '/welcome', element: <LandingPage /> },
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },

      {
        element: <ProtectedRoute />,
        children: [
          // 사이드바가 있는 화면들
          {
            element: <AppLayout />,
            children: [
              {
                path: '/',
                element: <FeedPage />,
                children: [{ path: 'posts/:postId', element: <PostDetailPage /> }],
              },
              { path: '/search', element: <SearchPage /> },
              // 내 좋아요 전용이라 /users/:userId 하위가 아니라 최상위다 (2026-08-03 합의).
              { path: '/likes', element: <LikedPostsPage /> },
              {
                path: '/users/:userId',
                element: <ProfilePage />,
                children: [
                  { path: 'followers', element: <FollowListModal tab="followers" /> },
                  { path: 'following', element: <FollowListModal tab="following" /> },
                ],
              },
              {
                path: '/chat',
                element: <ChatListPage />,
                children: [
                  { index: true, element: <ChatEmptyState /> },
                  { path: ':roomId', element: <ChatRoomPage /> },
                ],
              },
              { path: '/notifications', element: <NotificationsPage /> },

              // 프로필 설정도 셸 안에 둔다. 예전엔 "가입 직후엔 사이드바를 쓸 수 없다"는
              // 이유로 단독 화면이었는데, 온보딩이든 수정이든 여기서 다른 화면으로 빠져나갈
              // 길이 뒤로가기밖에 없어서 오히려 갇힌 느낌이 났다. 사이드바가 있어도
              // 온보딩 흐름(저장 → 내 프로필)은 그대로다.
              //
              // GitHub 연동 전용 화면(/settings/github)은 없앴다. 가입 직후 한 단계를 더
              // 강제할 만큼 중요한 일이 아니고, 미연동이면 프로필의 잔디 자리에 안내와 연동
              // 버튼이 그대로 뜬다. GitHub 승인 후 복귀도 이 경로와 무관하다 — 백엔드가
              // /users/{id}?github=connected 로 직접 돌려보낸다.
              { path: '/settings/profile', element: <ProfileSettingsPage /> },
            ],
          },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

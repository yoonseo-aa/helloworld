import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import { bootstrapAuth } from '@/api/client'
import { router } from '@/router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useBadgeStore } from '@/stores/useBadgeStore'
import {
  connectStomp,
  disconnectStomp,
  onPersonalMessage,
  onStompStatusChange,
} from '@/socket/stompClient'
import { getChatUnreadCount } from '@/features/chat/api'
import { handleChatRoomUpdateEvent, resyncDmBadge } from '@/features/chat/hooks'
import {
  handleNotificationPushEvent,
  resyncNotificationBadge,
} from '@/features/notification/hooks'
import { getUserProfile } from '@/features/profile/api'
import { markIntroDone } from '@/features/landing/session'
import ToastContainer from '@/components/ToastContainer'
import './index.css'

/**
 * accessToken이 없다(null) ↔ 있다 로 바뀌는 경계에서만 WebSocket을 연결/해제한다.
 * 페이지 마운트가 아니라 인증 상태에 직접 묶은 이유는, 사이드바(AppLayout) 밖의
 * 화면(/settings/profile 온보딩 등)에서도 로그인 상태면 연결이 유지돼야 해서다.
 * 토큰 재발급(값이 값으로 바뀌는 경우)은 여기 안 걸린다 — 이미 연결된 소켓은
 * 최초 CONNECT 때 검증된 사용자로 계속 신뢰되므로 다시 연결할 필요가 없다.
 *
 * 같은 경계에서 DM 안읽음 뱃지 초기값도 seed한다 — 개인 큐 push를 아직 한 번도
 * 못 받은 시점(로그인 직후·새로고침 직후)에 사이드바 뱃지가 0으로 비어 보이지
 * 않게 하려는 것(useBadgeStore 주석 참고).
 *
 * 내 프로필도 같은 자리에서 미리 받아 둔다. 낙관적 업데이트(댓글 작성·게시글 작성)가
 * 작성자 표시를 ['users', myUserId] 캐시에서 빌려오는데, 내 프로필 화면을 한 번도
 * 안 들렀으면 이 캐시가 비어 있어 폴백이 걸린다 — 방금 단 댓글의 작성자가 "나",
 * 방금 쓴 글의 작성자가 "이름 미설정"으로 떴다가 새로고침해야 진짜 닉네임이 나왔다.
 * 로그인·소셜 로그인·새로고침(재발급) 모두 이 경계를 지나므로 여기 한 곳이면 된다.
 */
useAuthStore.subscribe((state, prevState) => {
  if (state.accessToken && !prevState.accessToken) {
    // 이번 페이지 로드에서 토큰을 가진 적이 있다고 기록해 둔다. 이후 세션이 끊겨도
    // 인트로가 아니라 로그인 화면으로 보내기 위한 것이다(RouteGuards의 메인 분기).
    // 로그인·소셜 로그인·새로고침(재발급)이 모두 이 경계를 지난다.
    markIntroDone()
    connectStomp(state.accessToken)
    void getChatUnreadCount()
      .then((count) => useBadgeStore.getState().setDmUnreadCount(count))
      .catch(() => {
        // 실패해도 뱃지가 0으로 남을 뿐 — 다음 로그인·새로고침 때 다시 시도된다.
      })
    resyncNotificationBadge()
    const myUserId = state.userId
    if (myUserId !== null) {
      // prefetch라 실패해도 조용히 넘어간다 — 캐시가 비면 기존 폴백 문구로 돌아갈 뿐이다.
      void queryClient.prefetchQuery({
        queryKey: ['users', myUserId],
        queryFn: () => getUserProfile(myUserId),
      })
    }
  } else if (!state.accessToken && prevState.accessToken) {
    disconnectStomp()
    useBadgeStore.getState().setDmUnreadCount(0)
    useBadgeStore.getState().setNotificationUnreadCount(0)
    // 로그아웃하면 서버 캐시도 통째로 버린다. 안 그러면 **다음에 로그인한 사람에게 이전
    // 사용자의 데이터가 그대로 보인다** — queryClient는 모듈 싱글턴이고 로그인/로그아웃이
    // 전부 SPA 내비게이션이라 새로고침이 없으며, 캐시 키 중에는 사용자 id가 안 들어간 것이
    // 많다(['posts','feed',type] · ['chat','room-list',keyword] · ['notifications','list',filter]).
    // staleTime이 30초라 그 안에 계정을 바꿔 로그인하면 요청조차 나가지 않고 옛 화면이 뜬다.
    //
    // 이 자리에 두는 이유: 명시적 로그아웃(useLogout)과 재발급 실패로 인한 강제 로그아웃
    // (api/client.ts의 clearAuth)이 둘 다 이 경계를 지난다.
    queryClient.clear()
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 서버 데이터는 TanStack Query가 정본이다. Zustand에 복사해두지 않는다.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * 개인 큐(/user/queue/updates) 콜백 등록 — 앱 전역 1회, 컴포넌트 트리 밖(CLAUDE.md
 * "개인 큐 핸들링은 socket/에 두고 각 feature가 콜백을 등록한다" 규칙).
 *
 * 채팅(type=CHAT_MESSAGE)과 알림(type=NOTIFICATION)이 이 큐를 같이 쓴다. 각 핸들러가
 * 자기 type이 아니면 그냥 돌아가므로, 여기서 미리 분기하지 않고 둘 다 넘긴다 —
 * type 판정이 각 feature 안에 한 곳씩만 있게 된다.
 */
onPersonalMessage((payload) => {
  handleChatRoomUpdateEvent(queryClient, payload, useAuthStore.getState().userId)
  handleNotificationPushEvent(queryClient, payload)
})

/**
 * 연결(최초·재연결 모두) 성공 시 DM 뱃지·대화 목록을 서버 값으로 재동기화한다.
 * 뱃지는 개인 큐 push로 +1씩 올리는 러닝 카운터인데, 연결이 끊겨 있던 동안의 push는
 * 재전송되지 않으므로(개인 큐 특성 — 미접속자에게는 그냥 버려짐) 붙을 때마다 스냅샷으로
 * 유실분을 흡수한다. 위 로그인 경계의 seed와 겹칠 수 있지만 같은 값을 맞추는 것뿐이라 무해하다.
 */
onStompStatusChange((status) => {
  if (status !== 'connected') return
  resyncDmBadge(queryClient)
  // 알림 뱃지도 같은 이유로 다시 맞춘다(끊겨 있던 동안 온 알림은 재전송되지 않는다).
  resyncNotificationBadge()
})

/**
 * msw 워커 시작. DEV 가드 + 동적 import라 프로덕션 번들에는 msw가 포함되지 않는다.
 * 첫 요청(bootstrapAuth)보다 먼저 시작해야 가로채기가 빠짐없이 걸린다.
 */
async function enableMocking() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('./mocks/browser')
    // 목이 없는 요청(auth 등)은 실서버로 통과시킨다.
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
}

void enableMocking()
  .catch((error: unknown) => {
    // 목 워커가 못 떠도(스테일 워커 파일, secure context 아님 등) 앱은 떠야 한다.
    // 실패는 "목 없음"으로 강등하고 그대로 렌더한다.
    console.error('[msw] 워커 시작 실패 — 목 없이 실행합니다.', error)
  })
  .then(() => {
  // 렌더보다 먼저 재발급을 쏜다(await하지 않음). 응답이 오기 전까지 가드가
  // isBootstrapping을 보고 판단을 미루므로 로그인 화면이 번쩍이지 않는다.
  void bootstrapAuth()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastContainer />
        {/* 개발 모드에서만 렌더되고 프로덕션 번들에서는 패키지가 알아서 빠진다. */}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>,
  )
})

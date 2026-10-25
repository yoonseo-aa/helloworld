import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { isIntroDone } from '@/features/landing/session'

/**
 * 로그인이 필요한 화면을 감싼다. 미인증이면 /login으로 보내되,
 * 원래 가려던 위치를 state.from에 실어 로그인 후 되돌려 보낼 수 있게 한다.
 */
export function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const location = useLocation()

  // 재발급 시도 중에는 판단을 미룬다 (새로고침 시 로그인 화면 깜빡임 방지)
  if (isBootstrapping) return null

  if (!accessToken) {
    /*
     * 메인으로 들어온 비로그인 방문자는 인트로(/welcome)를 먼저 본다. 딥링크(/chat 등)로
     * 온 사람에게는 강제하지 않는다 — 가려던 곳이 분명하므로 곧장 로그인으로 보낸다.
     *
     * isIntroDone()이 거르는 건 딱 하나, **같은 페이지 로드 안에서 토큰을 잃은 경우**다.
     * 쿠키로 자동 복구된 사용자가 피드를 보다 세션이 끊기면 경로는 여전히 /이고 토큰만
     * 사라지는데, 이 조건이 없으면 글 읽던 사람이 로그인 화면 대신 4씬 인트로로 튕긴다.
     *
     * 반대로 새로고침·주소창 입력·새 탭은 전부 새 페이지 로드라 이 값이 초기화된다.
     * 그래서 "메인으로 오면 인트로"는 그대로 성립한다.
     */
    if (location.pathname === '/' && !isIntroDone()) {
      return <Navigate to="/welcome" replace />
    }
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

/**
 * 로그인/회원가입처럼 이미 로그인한 사용자가 볼 이유가 없는 화면을 감싼다.
 *
 * 리다이렉트 목적지는 location.state.redirectTo를 따르고, 없으면 '/'.
 * LoginForm·SignupForm이 로그인 API를 부르기 *전에* 이 state를 먼저 심어두는 이유는,
 * "토큰 세팅(signIn)"과 "이동(navigate)"을 각자 따로 호출하면 이 컴포넌트의 반사적
 * 리다이렉트(accessToken이 생기자마자 '/'로 보냄)와 경합해서, 의도한 목적지
 * (예: /settings/profile)로 못 가고 '/'로 먼저 튕겨나가는 레이스가 있었기 때문이다.
 * 목적지를 state로 미리 알려주면 이 컴포넌트가 유일한 이동 주체가 되어 경합이 없어진다.
 */
export function PublicOnlyRoute() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping)
  const location = useLocation()

  if (isBootstrapping) return null
  if (accessToken) {
    const redirectTo =
      (location.state as { redirectTo?: string } | null)?.redirectTo ?? '/'
    return <Navigate to={redirectTo} replace />
  }

  return <Outlet />
}

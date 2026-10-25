import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  checkEmailAvailability,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signup,
  socialLogin,
} from './api'
import type { SocialLoginRequest } from './types'
import { useAuthStore } from '@/stores/useAuthStore'
import { getUserProfile } from '@/features/profile/api'

/**
 * 로그인 성공 후 돌아갈 곳. 라우트 가드가 쫓아내며 심어둔 state.from을 읽는다
 * (RouteGuards의 Navigate ... state={{ from: location }}).
 *
 * **첫 렌더에 한 번만 고정한다.** LoginForm이 제출 직전에 state를 { redirectTo }로
 * 갈아끼우기 때문에, 매번 다시 읽으면 그 뒤로는 from이 사라져 '/'가 된다 —
 * 비밀번호를 한 번 틀리고 다시 제출하면 원래 가려던 곳 대신 피드로 튕겼고,
 * 같은 이유로 구글 버튼(클릭 시점에 읽는다)도 목적지를 잃었다.
 *
 * pathname만 쓰면 쿼리스트링이 날아간다 — 공유받은 /search?keyword=react로 왔다가
 * 로그인하면 빈 검색 화면이 뜬다. search·hash까지 붙여 원래 주소를 그대로 복원한다.
 */
export function useLoginRedirectTarget(): string {
  const location = useLocation()
  const [target] = useState(() => {
    const from = (
      location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null
    )?.from
    if (!from?.pathname) return '/'
    return from.pathname + (from.search ?? '') + (from.hash ?? '')
  })
  return target
}

export function useLogin() {
  const signIn = useAuthStore((s) => s.signIn)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: login,
    // 닉네임 없는 계정(가입만 하고 프로필 설정을 안 마친 상태)이면 온보딩으로 보낸다.
    //
    // 이 로직을 LoginForm이 mutate()에 넘기는 콜백에 두면 안 된다 — signIn()이
    // 실행되자마자 PublicOnlyRoute가 accessToken 변화를 보고 LoginForm을 그 자리에서
    // 언마운트시켜버리는데, mutate()에 넘긴 콜백은 그 컴포넌트(정확히는 그 컴포넌트가
    // 만든 mutation observer)가 살아있어야 호출된다. 언마운트가 그보다 먼저 일어나서
    // 콜백 자체가 아예 실행되지 않는 걸 실제로 확인했다. 훅에 등록한 이 onSuccess는
    // observer 생사와 무관하게 항상 실행되므로 여기서 처리한다.
    onSuccess: async (data) => {
      signIn(data.access_token)
      try {
        // 프로필 캐시(['users', id])에 담기게 fetchQuery로 받는다 — 그냥 getUserProfile을
        // 부르면 응답이 캐시 밖으로 흘러가, 낙관적 업데이트가 참조하는 자리가 여전히 빈다.
        // signIn() 직후 main.tsx의 인증 경계 프리페치도 같은 키로 나가는데, 같은 키라
        // 중복 요청이 되지 않고 진행 중인 쪽에 합류한다.
        const profile = await queryClient.fetchQuery({
          queryKey: ['users', data.user.user_id],
          queryFn: () => getUserProfile(data.user.user_id),
        })
        if (!profile.nickname) {
          navigate('/settings/profile', { replace: true })
        }
      } catch {
        // 프로필 조회 실패해도 로그인 자체는 됐으니 기존 목적지(from)에 둔다.
      }
    },
  })
}

/**
 * 소셜 로그인. is_new 여부로 목적지를 정해 signIn() 직후 직접 navigate()한다.
 * (예전엔 /oauth/callback/google이 PublicOnlyRoute 밑에 있어서, signIn() 순간
 * PublicOnlyRoute의 반사적 이동과 이 navigate가 경합해 신규 가입인데도 메인 피드로
 * 튕기는 버그가 있었다. router.tsx에서 이 라우트를 PublicOnlyRoute 밖으로 빼서
 * 경합 자체를 없앴다 — 여기서는 목적지를 정해서 이동만 하면 된다.)
 */
export function useSocialLogin() {
  const signIn = useAuthStore((s) => s.signIn)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({
      provider,
      request,
    }: {
      provider: string
      request: SocialLoginRequest
      from: string
    }) => socialLogin(provider, request),
    onSuccess: (data, variables) => {
      signIn(data.access_token)
      navigate(data.is_new ? '/settings/profile' : variables.from, { replace: true })
    },
  })
}

/**
 * 로그아웃. 서버 호출(Refresh Token 무효화) 성공·실패와 무관하게 항상 clearAuth +
 * /login 이동까지 끝낸다(onSettled) — 네트워크 문제로 서버 호출이 실패해도 사용자를
 * "로그아웃 안 된 것처럼 보이는" 상태에 가둬두지 않기 위해서다.
 */
export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearAuth()
      navigate('/login', { replace: true })
    },
  })
}

export function useSignup() {
  return useMutation({
    mutationFn: signup,
  })
}

export function useCheckEmailAvailability() {
  return useMutation({
    mutationFn: checkEmailAvailability,
  })
}

/** 비밀번호 재설정 메일 요청. 성공/실패 처리는 화면이 한다(재전송 타이머 등). */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: requestPasswordReset,
  })
}

/**
 * 재설정 토큰으로 새 비밀번호 확정.
 * 성공해도 자동 로그인하지 않는다 — 서버가 토큰만 소모할 뿐 세션을 주지 않고,
 * 메일 링크를 연 브라우저가 본인 것이라는 보장도 없다. 로그인 화면으로 보낸다.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: resetPassword,
  })
}

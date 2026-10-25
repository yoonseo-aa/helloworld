import { create } from 'zustand'

/**
 * accessToken(JWT)의 payload에서 sub(=user_id)를 꺼낸다.
 * 서버가 이미 서명해서 준 우리 토큰을 읽기만 하는 거라 별도 검증 없이 디코딩한다.
 */
function decodeUserId(token: string): number | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded)) as { sub?: string }
    return payload.sub ? Number(payload.sub) : null
  } catch {
    return null
  }
}

/**
 * 인증 상태 스토어.
 *
 * Access Token은 **메모리에만** 둔다 (CLAUDE.md 절대 규칙 1).
 * localStorage/sessionStorage에 저장하지 않는다 — XSS로 그대로 털리기 때문.
 * 새로고침으로 토큰이 날아가는 문제는 Refresh Token(HttpOnly 쿠키) 재발급으로 푼다.
 *
 * getState()로 React 밖(axios 인터셉터, STOMP 클라이언트)에서도 읽고 쓸 수 있다.
 */
interface AuthState {
  /** Access Token. null이면 미인증 상태로 본다. */
  accessToken: string | null
  /**
   * 앱 부팅 시 silent refresh(재발급 시도)가 진행 중인지.
   *
   * 새로고침하면 메모리 토큰이 없어 잠깐 미인증 상태가 된다. 이때 바로 /login으로 보내면
   * 재발급이 성공해도 이미 튕긴 뒤라 로그인 화면이 깜빡인다. 그래서 부팅 중에는 판단을 보류한다.
   *
   * 초기값이 true다 — main.tsx가 bootstrapAuth()로 재발급을 1회 시도하고,
   * 성공/실패와 무관하게 finishBootstrap()을 부른다. 그전까지 가드는 아무것도 그리지 않는다.
   */
  isBootstrapping: boolean
  /**
   * 로그인한 내 user_id. 사이드바의 /users/me를 실제 ID로 해석할 때 쓴다.
   *
   * **식별자만** 둔다. 닉네임·프로필 이미지처럼 서버가 정본인 데이터는 여기 복사하지 않고
   * TanStack Query로 가져온다 (CLAUDE.md 규칙 4).
   *
   * 재발급 API 응답엔 user_id가 없다(로그인 응답에만 내려옴). 예전엔 그래서
   * setAccessToken이 이 값을 안 건드렸는데, 그러면 새로고침 후(로그인은 유지되지만
   * userId만 비는 상태) /users/me가 영영 안 뜨는 버그가 있었다. 토큰(JWT) 자체에
   * user_id가 sub 클레임으로 들어있어서, 이제 토큰을 저장할 때마다 거기서 직접 꺼낸다.
   */
  userId: number | null

  /** 로그인 성공. 토큰을 넣는다 (userId는 토큰에서 자동으로 채워짐). */
  signIn: (token: string) => void
  /** 재발급 성공. 토큰을 갈아끼운다 (userId도 토큰 기준으로 다시 채워짐). */
  setAccessToken: (token: string) => void
  clearAuth: () => void
  finishBootstrap: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  isBootstrapping: true,
  userId: null,

  signIn: (token) => set({ accessToken: token, userId: decodeUserId(token) }),
  setAccessToken: (token) =>
    set((state) => ({
      accessToken: token,
      userId: decodeUserId(token) ?? state.userId,
    })),
  clearAuth: () => set({ accessToken: null, userId: null }),
  finishBootstrap: () => set({ isBootstrapping: false }),
}))

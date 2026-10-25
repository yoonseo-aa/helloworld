import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/useAuthStore'
import type { ApiResponse } from './types'

/**
 * baseURL을 두지 않는다 — vite.config.ts의 dev 프록시(및 배포 시 nginx)가
 * 같은 오리진에서 '/api'를 백엔드로 넘겨준다. 절대 URL을 쓰면 이 프록시를 우회한다.
 */
export const apiClient = axios.create({
  withCredentials: true,
})

/**
 * 요청별 재발급 정책.
 * - skipAuthRefresh: 401이 나도 재발급을 시도하지 않는다.
 *   재발급 요청 자신(무한 루프 방지)과, 401이 "만료"가 아니라 "비밀번호 틀림"을 뜻하는
 *   로그인·회원가입에 붙인다. 서버가 로그인 실패에도 401(AUTH_003)을 주기 때문에
 *   구분하지 않으면 비밀번호를 틀릴 때마다 무의미한 재발급 요청이 나간다.
 * - _retried: 재발급 후 재시도한 요청 표시. 같은 요청이 두 번 재시도되는 것을 막는다.
 */
export interface AuthRequestConfig extends InternalAxiosRequestConfig {
  skipAuthRefresh?: boolean
  _retried?: boolean
}

apiClient.interceptors.request.use((config) => {
  const accessToken = useAuthStore.getState().accessToken
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

/**
 * 진행 중인 재발급. 앱 전체에서 **항상 1개**만 존재한다.
 *
 * 합치지 않으면 이런 사고가 난다 — 화면 하나에서 API 3개를 동시에 부르고 셋 다 401이 나면
 * 재발급이 3번 나간다. 서버는 재발급 때마다 Refresh를 새로 발급·저장하므로
 * 먼저 끝난 것이 나머지 둘의 Refresh를 무효화하고, 그 둘이 실패하면서 강제 로그아웃된다.
 * (CLAUDE.md 절대규칙 2)
 */
let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  refreshPromise ??= apiClient
    .post<ApiResponse<{ access_token: string }>>('/api/auth/reissue', null, {
      skipAuthRefresh: true,
    } as AuthRequestConfig)
    .then((response) => {
      const accessToken = response.data.data.access_token
      useAuthStore.getState().setAccessToken(accessToken)
      return accessToken
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as AuthRequestConfig | undefined

    const shouldTryRefresh =
      error.response?.status === 401 &&
      config !== undefined &&
      !config.skipAuthRefresh &&
      !config._retried

    if (!shouldTryRefresh) {
      return Promise.reject(error)
    }

    config._retried = true

    // try 범위는 **재발급까지만**이다. 예전엔 재시도(`await apiClient(config)`)까지 같은
    // try 안에 있어서, 재발급은 성공했는데 재시도가 404·5xx·네트워크 오류로 실패해도
    // 같은 catch로 들어와 세션을 끊어 버렸다 — 삭제된 글을 열었을 뿐인데 이유 없이
    // 로그아웃되고, 화면에는 그 404가 아니라 처음의 401 메시지가 떴다.
    try {
      // 동시에 401을 맞은 다른 요청들도 여기서 같은 Promise를 기다린다.
      await refreshAccessToken()
    } catch {
      // 재발급 실패 = 세션이 끝난 것. 토큰을 비우면 라우트 가드가 로그인 화면으로 보낸다.
      useAuthStore.getState().clearAuth()
      return Promise.reject(error)
    }

    // 재시도는 try 밖에서 한다. 여기서 나는 실패는 그 요청의 진짜 에러이므로
    // 원래 401로 덮지 않고 호출부까지 그대로 전달한다(_retried가 찍혀 있어 재진입도 없다).
    // 요청 인터셉터가 새 토큰으로 Authorization을 다시 붙인다.
    return apiClient(config)
  },
)

/**
 * 앱 시작 시 1회. 새로고침하면 메모리의 Access Token이 사라지므로,
 * HttpOnly 쿠키의 Refresh로 조용히 되살릴 수 있는지 확인한다(silent refresh).
 *
 * 성공/실패와 무관하게 finishBootstrap()을 부른다 — 가드는 이 값이 false가 되어야
 * 판단을 시작하고, 그전까지는 아무것도 그리지 않아 로그인 화면 깜빡임이 없다.
 */
export async function bootstrapAuth(): Promise<void> {
  try {
    await refreshAccessToken()
  } catch {
    // 비로그인 상태이거나 Refresh가 만료됨 — 정상 흐름이므로 조용히 넘어간다.
  } finally {
    useAuthStore.getState().finishBootstrap()
  }
}

import { apiClient, type AuthRequestConfig } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  EmailAvailabilityResponse,
  LoginRequest,
  LoginResponse,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  SignupRequest,
  SignupResponse,
  SocialLoginRequest,
  SocialLoginResponse,
} from './types'

/**
 * 로그인·회원가입에는 skipAuthRefresh를 붙인다.
 * 서버가 "비밀번호 틀림"에도 401(AUTH_003)을 주기 때문에, 이 표시가 없으면
 * 비밀번호를 틀릴 때마다 인터셉터가 "토큰이 만료됐구나" 하고 재발급을 시도한다.
 */
export async function login(request: LoginRequest) {
  const { data } = await apiClient.post<ApiResponse<LoginResponse>>(
    '/api/auth/login',
    request,
    { skipAuthRefresh: true } as AuthRequestConfig,
  )
  return data.data
}

export async function signup(request: SignupRequest) {
  const { data } = await apiClient.post<ApiResponse<SignupResponse>>(
    '/api/users',
    request,
    { skipAuthRefresh: true } as AuthRequestConfig,
  )
  return data.data
}

/**
 * 소셜 로그인. 비밀번호 로그인과 같은 이유로 skipAuthRefresh를 붙인다 — 인가 코드가
 * 만료/재사용된 경우도 401이 아니라 다른 상태코드(AUTH_004 등)라 실제로는 필요 없을 수 있지만,
 * "로그인 시도 자체는 재발급 인터셉터를 안 타야 한다"는 원칙을 login()과 동일하게 지킨다.
 */
export async function socialLogin(provider: string, request: SocialLoginRequest) {
  const { data } = await apiClient.post<ApiResponse<SocialLoginResponse>>(
    `/api/auth/social/${provider}`,
    request,
    { skipAuthRefresh: true } as AuthRequestConfig,
  )
  return data.data
}

/**
 * 로그아웃. Refresh Token 쿠키를 서버가 무효화하고 즉시 만료시켜 돌려준다
 * (AuthController.logout 참고). skipAuthRefresh를 붙이는 이유는, 로그아웃 자체가
 * 401을 맞아도(이미 만료된 상태 등) 재발급을 시도할 이유가 없어서다 — 어차피
 * 곧바로 로그아웃 처리(clearAuth)할 거라 재시도가 무의미하다.
 */
export async function logout() {
  await apiClient.post('/api/auth/logout', null, {
    skipAuthRefresh: true,
  } as AuthRequestConfig)
}

/**
 * 비밀번호 재설정 메일 요청.
 *
 * 응답에 아무 데이터가 없다 — 가입되지 않은 이메일에도 200이다(계정 열거 방지).
 * 그래서 화면은 "보냈다"까지만 말할 수 있고 "그 주소로 갔다"고 단정하면 안 된다.
 *
 * skipAuthRefresh: 로그인 전 화면이라 애초에 토큰이 없다. 이 표시가 없으면 서버가
 * 어떤 이유로든 401을 줄 때 인터셉터가 재발급을 시도하고, 그 실패가 강제 로그아웃으로
 * 번진다 — 로그인·회원가입과 같은 이유다.
 */
export async function requestPasswordReset(request: PasswordResetRequest) {
  await apiClient.post('/api/auth/password/reset-request', request, {
    skipAuthRefresh: true,
  } as AuthRequestConfig)
}

/**
 * 재설정 토큰으로 새 비밀번호 확정.
 * 토큰이 만료(30분)·재사용·위조면 서버가 4xx를 준다 — 화면은 그걸 그대로 안내한다.
 */
export async function resetPassword(request: PasswordResetConfirmRequest) {
  await apiClient.post('/api/auth/password/reset', request, {
    skipAuthRefresh: true,
  } as AuthRequestConfig)
}

/**
 * 이메일 사용 가능 여부를 boolean으로 돌려준다.
 *
 * 중복이어도 서버는 200을 준다 — "이 이메일 쓸 수 있나요?"에 대한 "아니오"는
 * 조회 실패가 아니라 정상 답변이기 때문. 판정은 상태 코드가 아니라 data.is_available에 있다.
 * (409는 실제로 계정을 만들다 부딪히는 회원가입 POST 쪽에서 쓴다)
 * 따라서 여기서 에러가 나면 그건 진짜 통신/서버 실패다.
 */
export async function checkEmailAvailability(email: string) {
  const { data } = await apiClient.get<ApiResponse<EmailAvailabilityResponse>>(
    '/api/users/check-email',
    { params: { email } },
  )
  return data.data.is_available
}

export interface LoginRequest {
  email: string
  password: string
}

/** 로그인 응답 회원 요약. 비밀번호 등 민감정보는 서버가 내려주지 않는다. */
export interface LoginUser {
  user_id: number
  email: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  /** Access Token 만료까지 남은 초. 만료 전 선제 재발급을 붙일 때 쓸 값. */
  expires_in: number
  user: LoginUser
}

export interface SignupRequest {
  email: string
  password: string
}

export interface SignupResponse {
  user_id: number
  email: string
}

/** GET /api/users/check-email 의 data. 중복이어도 200이고 판정은 이 필드에 있다. */
export interface EmailAvailabilityResponse {
  is_available: boolean
}

/**
 * POST /api/auth/password/reset-request 요청.
 * 서버는 가입되지 않은 이메일에도 200을 준다(계정 열거 방지) — 응답으로 가입 여부를 알 수 없다.
 */
export interface PasswordResetRequest {
  email: string
}

/**
 * POST /api/auth/password/reset 요청.
 * token은 메일 링크의 쿼리스트링(`/password/reset?token=...`)으로 들어온다. 30분·1회용이다.
 */
export interface PasswordResetConfirmRequest {
  token: string
  new_password: string
}

/** POST /api/auth/social/{provider} 요청. code=구글 인가 코드, redirect_uri=인가 요청 때 쓴 값과 동일해야 함(구글이 검증). */
export interface SocialLoginRequest {
  code: string
  redirect_uri: string
}

/** POST /api/auth/social/{provider} 의 data. is_new=true면 프로필 설정으로, false면 원래 목적지로. */
export interface SocialLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user_id: number
  is_new: boolean
}

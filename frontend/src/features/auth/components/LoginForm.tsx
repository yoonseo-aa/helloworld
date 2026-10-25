import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLogin, useLoginRedirectTarget } from '../hooks'
import GoogleLoginButton from './GoogleLoginButton'
import { getErrorMessage } from '@/api/errors'

/* 입력창 장식용 인라인 아이콘 (시안 Login.dc.html과 동일 패스) */
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function MailIcon() {
  return (
    <svg width="16" height="16" {...iconProps}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" {...iconProps}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="17" height="17" {...iconProps}>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg width="17" height="17" {...iconProps}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function AlertIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { mutate, isPending } = useLogin()

  // 가드가 쫓아내면서 붙여둔 쪽지. 로그인 후 원래 가려던 곳으로 돌려보낸다.
  // 첫 렌더에 한 번 고정된다 — 아래 navigate가 state를 갈아끼워도 값이 유지된다.
  const from = useLoginRedirectTarget()

  const canSubmit = email.length > 0 && password.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    // 로그인 API를 부르기 *전에* 목적지를 state에 심어둔다. PublicOnlyRoute가
    // signIn() 직후 이 state(redirectTo)를 보고 이동을 처리하므로, 여기서
    // onSuccess에 navigate를 따로 두지 않는다 — 직접 부르면 PublicOnlyRoute의
    // 반사적 '/' 이동과 경합해서 원래 가려던 곳(from) 대신 '/'로 튕길 수 있다.
    // replace: true라 히스토리에 /login이 남지 않는 건 기존과 동일하다.
    navigate(location.pathname, { replace: true, state: { redirectTo: from } })
    // 닉네임 유무를 보고 /settings/profile로 보낼지 판단하는 로직은 useLogin
    // 훅의 onSuccess로 옮겼다 (여기 넘기는 콜백은 컴포넌트 언마운트 타이밍 때문에
    // 실행이 안 되는 문제가 있었다 — features/auth/hooks.ts 주석 참고).
    mutate(
      { email, password },
      {
        onError: (error) =>
          setErrorMessage(getErrorMessage(error, '로그인에 실패했습니다.')),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
      {errorMessage && (
        <div
          role="alert"
          className="border-danger/45 bg-danger/8 text-ink flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed break-keep"
        >
          <span className="text-danger mt-0.5 flex-none">
            <AlertIcon />
          </span>
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-ink-muted text-[12.5px] font-medium tracking-[0.04em]">
          이메일 주소
        </label>
        <div className="relative">
          <span className="text-ink-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
            <MailIcon />
          </span>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="이메일 주소를 입력하세요"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-line placeholder:text-ink-subtle focus:border-brand w-full rounded-lg border py-3 pr-3 pl-10 text-sm outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-ink-muted text-[12.5px] font-medium tracking-[0.04em]"
        >
          비밀번호
        </label>
        <div className="relative">
          <span className="text-ink-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
            <LockIcon />
          </span>
          <input
            id="password"
            type={passwordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-line placeholder:text-ink-subtle focus:border-brand w-full rounded-lg border py-3 pr-11 pl-10 text-sm outline-none"
          />
          <button
            type="button"
            aria-label={passwordVisible ? '비밀번호 숨기기' : '비밀번호 표시'}
            onClick={() => setPasswordVisible((x) => !x)}
            className="text-ink-subtle hover:text-ink absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md"
          >
            <EyeIcon off={passwordVisible} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Link to="/password/reset" className="text-brand-hover text-[13.5px] hover:underline">
          비밀번호를 잊으셨나요?
        </Link>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="bg-brand hover:bg-brand-hover min-h-12 rounded-lg px-3 text-[15px] font-semibold tracking-[0.02em] text-white transition-colors disabled:opacity-50"
      >
        {isPending ? '로그인 중...' : '로그인'}
      </button>

      <div className="border-line flex items-center gap-3.5 before:h-px before:flex-1 before:bg-current after:h-px after:flex-1 after:bg-current">
        <span className="text-ink-subtle text-xs tracking-[0.1em]">또는</span>
      </div>

      <GoogleLoginButton />

      <p className="text-ink-muted m-0 text-center text-[13.5px]">
        계정이 없으신가요?{' '}
        <Link to="/signup" className="text-brand-hover hover:underline">
          회원가입하기
        </Link>
      </p>
    </form>
  )
}

export default LoginForm

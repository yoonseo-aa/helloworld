import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '@/api/errors'
import { useResetPassword } from '../hooks'

/* LoginForm과 같은 패스의 인라인 아이콘. */
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

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

function AlertIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

/** 백엔드 PasswordResetConfirmRequest의 @Size(min=8, max=64)와 같은 값. */
const MIN_PASSWORD = 8
const MAX_PASSWORD = 64

/**
 * 새 비밀번호 설정 — 메일 링크(`/password/reset?token=...`)로 들어온 단계.
 *
 * <p>시안에는 이 화면이 없다(Password Reset.dc.html은 요청→전송 완료까지만 그린다).
 * 그래서 요청 화면과 같은 카드·같은 입력 형태를 쓰고, 문구만 이 단계에 맞게 썼다.
 *
 * <p>성공해도 자동 로그인하지 않는다. 서버는 토큰을 소모할 뿐 세션을 주지 않고,
 * 메일 링크를 연 브라우저가 본인 것이라는 보장도 없다 — 새 비밀번호로 직접 로그인하게 한다.
 */
export default function PasswordResetConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()
  const { mutate, isPending } = useResetPassword()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return
    // 길이는 서버도 검사하지만, 두 칸이 다른 건 서버가 모르는 규칙이라 여기서만 잡는다.
    const message =
      password.length < MIN_PASSWORD
        ? `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`
        : password.length > MAX_PASSWORD
          ? `비밀번호는 ${MAX_PASSWORD}자 이하여야 해요.`
          : password !== confirm
            ? '두 비밀번호가 서로 달라요.'
            : ''
    if (message) {
      setFieldError(message)
      return
    }
    setErrorMessage('')
    mutate(
      { token, new_password: password },
      {
        onSuccess: () => setDone(true),
        onError: (error) =>
          setErrorMessage(
            getErrorMessage(
              error,
              '링크가 만료되었거나 이미 사용된 것 같아요. 재설정을 다시 요청해 주세요.',
            ),
          ),
      },
    )
  }

  if (done) {
    return (
      <>
        <div className="border-success/40 bg-success/[8%] text-success mb-[22px] flex h-16 w-16 items-center justify-center rounded-full border">
          <svg width="26" height="26" {...iconProps} strokeWidth={1.8}>
            <path d="m4 12.5 5.2 5.2L20 6.8" />
          </svg>
        </div>
        <h1 className="text-ink mb-2.5 text-[27px] font-bold tracking-[-0.02em] break-keep">
          비밀번호를 변경했어요
        </h1>
        <p className="text-ink-muted mb-7 text-[14.5px] leading-[1.75] break-keep">
          새 비밀번호로 로그인해 주세요. 이 링크는 이제 쓸 수 없어요.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="bg-brand hover:bg-brand-hover min-h-12 rounded-lg px-3 text-[15px] font-semibold tracking-[0.02em] text-white transition-colors"
        >
          로그인하러 가기
        </button>
      </>
    )
  }

  return (
    <>
      <h1 className="text-ink mb-2.5 text-[27px] font-bold tracking-[-0.02em] break-keep">
        새 비밀번호 설정
      </h1>
      <p className="text-ink-muted mb-7 text-[14.5px] leading-[1.75] break-keep">
        앞으로 로그인할 때 쓸 비밀번호를 입력해 주세요.
        <br />
        {MIN_PASSWORD}자 이상이면 됩니다.
      </p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[18px]">
        {errorMessage && (
          <div
            role="alert"
            className="border-danger/45 bg-danger/8 text-ink flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed break-keep"
          >
            <span className="text-danger mt-0.5 flex-none">
              <AlertIcon size={15} />
            </span>
            <span>
              {errorMessage}{' '}
              <Link to="/password/reset" className="text-brand-hover underline">
                다시 요청하기
              </Link>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="new-password"
            className="text-ink-muted text-[12.5px] font-medium tracking-[0.04em]"
          >
            새 비밀번호
          </label>
          <div className="relative">
            <span className="text-ink-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
              <LockIcon />
            </span>
            <input
              id="new-password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={`${MIN_PASSWORD}자 이상 입력하세요`}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setFieldError('')
              }}
              className="border-line placeholder:text-ink-subtle focus:border-brand w-full rounded-lg border py-3 pr-11 pl-10 text-sm outline-none"
            />
            {/* 표시 토글은 한 곳에만 둔다 — 두 칸에 각각 두면 '확인' 칸의 의미(다시 쳐서 맞추기)가 사라진다. */}
            <button
              type="button"
              aria-label={visible ? '비밀번호 숨기기' : '비밀번호 표시'}
              onClick={() => setVisible((x) => !x)}
              className="text-ink-subtle hover:text-ink absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md"
            >
              <EyeIcon off={visible} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="confirm-password"
            className="text-ink-muted text-[12.5px] font-medium tracking-[0.04em]"
          >
            새 비밀번호 확인
          </label>
          <div className="relative">
            <span className="text-ink-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
              <LockIcon />
            </span>
            <input
              id="confirm-password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="한 번 더 입력하세요"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setFieldError('')
              }}
              aria-invalid={fieldError ? 'true' : 'false'}
              className="border-line placeholder:text-ink-subtle focus:border-brand aria-[invalid=true]:border-danger w-full rounded-lg border py-3 pr-3 pl-10 text-sm outline-none"
            />
          </div>
          {fieldError && (
            <p role="alert" className="text-danger flex items-center gap-1.5 text-[12.5px]">
              <AlertIcon />
              {fieldError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || password.length === 0 || confirm.length === 0}
          className="bg-brand hover:bg-brand-hover min-h-12 rounded-lg px-3 text-[15px] font-semibold tracking-[0.02em] text-white transition-colors disabled:opacity-50"
        >
          {isPending ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>
    </>
  )
}

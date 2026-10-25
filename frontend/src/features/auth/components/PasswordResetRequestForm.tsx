import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '@/api/errors'
import { useToastStore } from '@/stores/useToastStore'
import { useRequestPasswordReset } from '../hooks'

/* 입력창 장식용 인라인 아이콘 — LoginForm과 같은 패스(시안 Password Reset.dc.html). */
const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function MailIcon({ size = 16, strokeWidth }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} {...iconProps} strokeWidth={strokeWidth ?? iconProps.strokeWidth}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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

/** 재전송 대기 시간(초) — 시안 값. 서버에도 요청 레이트 리밋이 걸려 있어 연타는 어차피 막힌다. */
const RESEND_SECONDS = 30

/**
 * 비밀번호 재설정 요청 — 시안 Password Reset.dc.html의 "요청 → 전송 완료" 2단계.
 *
 * <p><b>실패해도 성공처럼 보인다.</b> 서버가 가입되지 않은 이메일에도 200을 주기 때문이다
 * (계정 열거 방지 — PasswordResetController 주석). 그래서 문구를 "그 주소로 보냈어요"가
 * 아니라 "가입된 주소라면 도착해요"에 가깝게 쓴다. 여기서 "없는 계정입니다"를 보여주면
 * 서버가 감추려던 정보를 화면이 도로 흘리는 셈이다.
 *
 * <p>실제로 에러를 띄우는 경우는 통신 실패와 레이트 리밋(429)뿐이다.
 */
export default function PasswordResetRequestForm() {
  const [step, setStep] = useState<'request' | 'sent'>('request')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [resendLeft, setResendLeft] = useState(0)
  const showToast = useToastStore((state) => state.show)
  const { mutate, isPending } = useRequestPasswordReset()

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResendLeft(RESEND_SECONDS)
    timerRef.current = setInterval(() => {
      setResendLeft((left) => {
        if (left <= 1 && timerRef.current) clearInterval(timerRef.current)
        return left - 1
      })
    }, 1000)
  }
  // 화면을 떠날 때 타이머를 정리한다 — 안 하면 사라진 컴포넌트의 setState가 계속 돈다.
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function send(target: string, onDone: () => void) {
    setErrorMessage('')
    mutate(
      { email: target },
      {
        onSuccess: onDone,
        onError: (error) =>
          setErrorMessage(
            getErrorMessage(error, '메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.'),
          ),
      },
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return
    const target = email.trim()
    // 형식 검사는 서버에도 있지만(@Email), 오타 한 글자 때문에 왕복하고 30초를 기다리게
    // 두는 것보다 여기서 잡는 게 낫다. 판정 기준은 시안과 같은 최소 형태다.
    const message = !target
      ? '이메일 주소를 입력해 주세요.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)
        ? '올바른 이메일 형식이 아니에요.'
        : ''
    if (message) {
      setEmailError(message)
      return
    }
    send(target, () => {
      setStep('sent')
      startResendTimer()
    })
  }

  if (step === 'sent') {
    return (
      <>
        <div className="border-success/40 bg-success/[8%] text-success mb-[22px] flex h-16 w-16 items-center justify-center rounded-full border">
          <MailIcon size={26} strokeWidth={1.8} />
        </div>
        <h1 className="text-ink mb-2.5 text-[27px] font-bold tracking-[-0.02em] break-keep">
          메일함을 확인해 주세요
        </h1>
        <p className="text-ink-muted mb-1.5 text-[14.5px] leading-[1.75] break-keep">
          <span className="text-ink font-mono text-[13.5px]">{email.trim()}</span> 주소로
          <br />
          비밀번호 재설정 링크를 보냈어요.
        </p>
        {/* 가입되지 않은 주소여도 서버는 성공으로 답한다 — 그 사실을 감추지 않고 문구로 알린다. */}
        <p className="text-ink-subtle mb-7 text-[13px] leading-[1.7] break-keep">
          가입된 주소일 때만 메일이 도착해요. 링크는 30분 동안 유효하고, 메일이 안 보이면
          스팸함도 확인해 주세요.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="border-danger/45 bg-danger/8 text-ink mb-4 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed break-keep"
          >
            <span className="text-danger mt-0.5 flex-none">
              <AlertIcon size={15} />
            </span>
            <span>{errorMessage}</span>
          </div>
        )}

        <Link
          to="/login"
          className="bg-brand hover:bg-brand-hover flex min-h-12 items-center justify-center rounded-lg px-3 text-[15px] font-semibold tracking-[0.02em] text-white transition-colors"
        >
          로그인으로 돌아가기
        </Link>
        <p className="text-ink-muted mt-5 text-center text-[13.5px]">
          메일을 못 받으셨나요?{' '}
          {resendLeft > 0 ? (
            <span className="text-ink-subtle tabular-nums">
              {resendLeft}초 후 다시 보내기
            </span>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                send(email.trim(), () => {
                  showToast('success', '재설정 링크를 다시 보냈어요.')
                  startResendTimer()
                })
              }
              className="text-brand-hover hover:underline disabled:opacity-50"
            >
              {isPending ? '보내는 중...' : '다시 보내기'}
            </button>
          )}
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-ink mb-2.5 text-[27px] font-bold tracking-[-0.02em] break-keep">
        비밀번호를 잊으셨나요?
      </h1>
      <p className="text-ink-muted mb-7 text-[14.5px] leading-[1.75] break-keep">
        가입한 이메일 주소를 입력하시면
        <br />
        비밀번호 재설정 링크를 보내드릴게요.
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
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="reset-email"
            className="text-ink-muted text-[12.5px] font-medium tracking-[0.04em]"
          >
            이메일 주소
          </label>
          <div className="relative">
            <span className="text-ink-subtle pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2">
              <MailIcon />
            </span>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="이메일 주소를 입력하세요"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailError('')
              }}
              aria-invalid={emailError ? 'true' : 'false'}
              className="border-line placeholder:text-ink-subtle focus:border-brand aria-[invalid=true]:border-danger w-full rounded-lg border py-3 pr-3 pl-10 text-sm outline-none"
            />
          </div>
          {emailError && (
            <p role="alert" className="text-danger flex items-center gap-1.5 text-[12.5px]">
              <AlertIcon />
              {emailError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="bg-brand hover:bg-brand-hover min-h-12 rounded-lg px-3 text-[15px] font-semibold tracking-[0.02em] text-white transition-colors disabled:opacity-50"
        >
          {isPending ? '전송 중...' : '재설정 링크 보내기'}
        </button>
      </form>
    </>
  )
}

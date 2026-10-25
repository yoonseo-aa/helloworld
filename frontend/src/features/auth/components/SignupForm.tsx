import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCheckEmailAvailability, useSignup } from '../hooks'
import GoogleLoginButton from './GoogleLoginButton'
import { getErrorMessage } from '@/api/errors'

/** 백엔드 UserCreateRequest의 @Size(min = 8)과 같은 값. 한쪽만 바꾸면 조용히 어긋난다. */
const MIN_PASSWORD_LENGTH = 8

type EmailCheckResult = 'idle' | 'available' | 'duplicate'

function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [emailCheckResult, setEmailCheckResult] =
    useState<EmailCheckResult>('idle')
  // **어떤 이메일을** 확인한 결과인지 같이 들고 있어야 한다. 확인 요청을 보낸 뒤 주소를
  // 고치면 늦게 도착한 옛 응답이 새 주소 아래에 '사용 가능'으로 붙어, 확인하지 않은
  // 이메일로 가입 버튼이 열렸다(서버 유일성 검사에서야 409로 막힌다).
  const [checkedEmail, setCheckedEmail] = useState('')
  const navigate = useNavigate()
  const { mutate, isPending } = useSignup()
  const { mutate: checkEmail, isPending: isCheckingEmail } =
    useCheckEmailAvailability()

  const isPasswordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const isPasswordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm
  // 중복 확인을 통과해야 가입할 수 있다. 이게 없으면 "이미 가입된 이메일입니다"가
  // 떠 있는 상태에서도 버튼이 눌려 중복 확인 버튼의 존재 이유가 사라진다.
  const canSubmit =
    emailCheckResult === 'available' &&
    checkedEmail === email &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === passwordConfirm

  function handleCheckEmail() {
    setErrorMessage('')
    checkEmail(email, {
      // 중복이어도 200이라 성공 콜백으로 온다. 판정은 응답 body의 is_available.
      onSuccess: (isAvailable) => {
        setCheckedEmail(email)
        setEmailCheckResult(isAvailable ? 'available' : 'duplicate')
      },
      // 여기로 오는 건 네트워크 끊김·서버 오류 등 진짜 실패뿐이다.
      onError: () => {
        setEmailCheckResult('idle')
        setErrorMessage('이메일 중복 확인에 실패했습니다.')
      },
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    mutate(
      { email, password },
      {
        // 가입 후 자동 로그인은 하지 않는다. 로그인 화면에서 다시 로그인하면,
        // 그때 닉네임 유무를 보고 프로필 설정으로 보낼지 정한다 (LoginForm 참고).
        onSuccess: () => navigate('/login', { replace: true }),
        onError: (error) =>
          setErrorMessage(getErrorMessage(error, '회원가입에 실패했습니다.')),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-ink-muted text-sm font-medium">
          이메일:
        </label>
        <div className="flex gap-2">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="example@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailCheckResult('idle')
            }}
            className="border-line flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCheckEmail}
            disabled={email.length === 0 || isCheckingEmail}
            className="border-line hover:bg-surface-muted shrink-0 rounded-lg border px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
          >
            {isCheckingEmail ? '확인 중...' : '중복 확인'}
          </button>
        </div>
        {emailCheckResult === 'available' && (
          <p className="text-success text-sm">사용 가능한 이메일입니다.</p>
        )}
        {emailCheckResult === 'duplicate' && (
          <p className="text-danger text-sm">이미 가입된 이메일입니다.</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          className="text-ink-muted text-sm font-medium"
        >
          비밀번호:
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder={`${MIN_PASSWORD_LENGTH}자 이상 입력해주세요`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-line rounded-lg border px-3 py-2 text-sm"
        />
        {isPasswordTooShort && (
          <p className="text-danger text-sm">
            비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="passwordConfirm"
          className="text-ink-muted text-sm font-medium"
        >
          비밀번호 확인:
        </label>
        <input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className="border-line rounded-lg border px-3 py-2 text-sm"
        />
        {isPasswordMismatch && (
          <p className="text-danger text-sm">비밀번호가 일치하지 않습니다.</p>
        )}
      </div>

      {errorMessage && <p className="text-danger text-sm">{errorMessage}</p>}

      <button
        type="submit"
        disabled={!canSubmit || isPending}
        className="bg-brand hover:bg-brand-hover rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      >
        {isPending ? '가입 중...' : '회원가입'}
      </button>

      <div className="border-line flex items-center gap-3 text-xs before:h-px before:flex-1 before:bg-current after:h-px after:flex-1 after:bg-current">
        <span className="text-ink-subtle">또는</span>
      </div>

      <GoogleLoginButton />

      <Link
        to="/login"
        className="text-ink-subtle hover:text-ink text-center text-sm"
      >
        이미 계정이 있으신가요? 로그인
      </Link>
    </form>
  )
}

export default SignupForm

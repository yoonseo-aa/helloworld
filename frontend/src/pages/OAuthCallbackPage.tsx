import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSocialLogin } from '@/features/auth/hooks'
import {
  OAUTH_FROM_KEY,
  OAUTH_NONCE_KEY,
} from '@/features/auth/components/GoogleLoginButton'
import { getErrorMessage } from '@/api/errors'

/**
 * 구글이 인가 코드를 들고 돌려보내는 페이지. 화면은 로딩/에러만 보여준다.
 *
 * StrictMode(main.tsx)는 개발 모드에서 effect를 두 번 실행한다 — 인가 코드는 1회용이라
 * 그대로 두면 두 번째 호출이 "코드 만료/재사용"으로 실패한다. hasStarted ref로 막는다.
 */
export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { mutate } = useSocialLogin()
  const [errorMessage, setErrorMessage] = useState('')
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const savedNonce = sessionStorage.getItem(OAUTH_NONCE_KEY)
    const from = sessionStorage.getItem(OAUTH_FROM_KEY) ?? '/'
    sessionStorage.removeItem(OAUTH_NONCE_KEY)
    sessionStorage.removeItem(OAUTH_FROM_KEY)

    // 사용자가 구글 동의 화면에서 취소하면 code 없이 error만 붙어서 돌아온다.
    if (searchParams.get('error')) {
      setErrorMessage('구글 로그인이 취소되었습니다.')
      return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    if (!code || !state || state !== savedNonce) {
      setErrorMessage('요청 검증에 실패했습니다. 다시 시도해주세요.')
      return
    }

    // from(성공 시 원래 목적지)은 여기서 그대로 mutate에 넘긴다 — is_new를 알아야
    // 최종 목적지가 정해지므로, 실제 navigate는 useSocialLogin의 onSuccess가
    // 응답을 받은 시점에 직접 한다(features/auth/hooks.ts 주석 참고).
    mutate(
      {
        provider: 'google',
        request: {
          code,
          redirect_uri: `${window.location.origin}/oauth/callback/google`,
        },
        from,
      },
      { onError: (err) => setErrorMessage(getErrorMessage(err, '구글 로그인에 실패했습니다.')) },
    )
  }, [searchParams, mutate])

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-8 text-center">
      {errorMessage ? (
        <>
          <p className="text-danger text-sm">{errorMessage}</p>
          <Link to="/login" className="text-brand text-sm hover:underline">
            로그인으로 돌아가기
          </Link>
        </>
      ) : (
        <p className="text-ink-muted text-sm">구글 로그인 처리 중...</p>
      )}
    </div>
  )
}

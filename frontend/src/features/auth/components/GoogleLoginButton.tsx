import { useLoginRedirectTarget } from '../hooks'

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const REDIRECT_PATH = '/oauth/callback/google'

export const OAUTH_NONCE_KEY = 'oauth:google:nonce'
export const OAUTH_FROM_KEY = 'oauth:google:from'

/**
 * 구글 로그인 버튼. 클릭 시 구글 동의 화면으로 브라우저를 통째로 이동시킨다(SPA 네비게이션 아님).
 *
 * state 파라미터는 CSRF 방지용 랜덤값이다 — 여기서 만들어 sessionStorage에 남겨두고,
 * 콜백(OAuthCallbackPage)에서 구글이 그대로 돌려준 state와 대조한다. 로그인 성공 후
 * 돌아갈 위치(from)도 이 라운드트립 동안 sessionStorage에 잠깐 들고 있는다 — 구글로
 * 갔다 오는 전체 페이지 이동이라 React Router의 location.state로는 못 들고 다닌다.
 */
function GoogleLoginButton() {
  // 로그인 폼과 같은 값을 쓴다 — 클릭 시점에 다시 읽으면 폼이 갈아끼운 state 때문에 목적지를 잃는다.
  const from = useLoginRedirectTarget()

  function handleClick() {
    const nonce = crypto.randomUUID()
    sessionStorage.setItem(OAUTH_NONCE_KEY, nonce)
    sessionStorage.setItem(OAUTH_FROM_KEY, from)

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      redirect_uri: `${window.location.origin}${REDIRECT_PATH}`,
      response_type: 'code',
      scope: 'openid email profile',
      state: nonce,
    })
    window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      // 구글 공식 배포 에셋(signin-assets)에서 실측한 값으로 맞췄다. 구글은 라이트·다크
      // 두 변형을 따로 배포하고 각각의 색을 고정한다:
      //   Light — 배경 white / 테두리 #747775 / 글자 #1F1F1F
      //   Dark  — 배경 #131314 / 테두리 #8E918F / 글자 #E3E3E3
      // 모서리 4px, 로고 20px은 공통. 라이트 변형은 어두운 배경에서도 규정상 허용되지만
      // 다크 화면에서 홀로 하얗게 튀어서, 구글이 그 용도로 배포하는 다크 변형을 쓴다.
      //
      // 구글은 규격(색·로고·여백)만 지키면 직접 만든 버튼도 허용하므로, 공식 SVG를 그대로
      // 쓰는 대신 이 방식을 택했다 — 공식 SVG는 문구가 path로 박혀 있어 영어 고정이고
      // 180×40 고정이라 폭을 채우면 로고와 글자가 늘어난다.
      // (로고 자체는 규정대로 원본 색을 그대로 둔다 — 두 변형 모두 같은 4색 마크다.)
      className="flex min-h-[46px] items-center justify-center gap-2.5 rounded border border-[#747775] bg-white px-3 py-2 text-[14px] font-medium text-[#1F1F1F] transition-colors hover:bg-[#f7f8f8] dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1e1f20]"
    >
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
      Google로 계속하기
    </button>
  )
}

export default GoogleLoginButton

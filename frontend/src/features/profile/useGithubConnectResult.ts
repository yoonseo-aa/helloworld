import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToastStore } from '@/stores/useToastStore'

/**
 * 백엔드가 붙여 보내는 reason 코드 → 사용자에게 보여줄 메시지.
 *
 * 목록은 실제 백엔드(feature/be-github)에서 확인했다. GithubOAuthFlowService가 리다이렉트에
 * 넣는 값은 두 종류다 — 흐름에서 직접 만드는 리터럴(INVALID_STATE / ACCESS_DENIED / NO_CODE)과
 * 예외의 ErrorCode 코드(GITHUB_* 및 COMMON_SERVER_ERROR).
 *
 * 여기 없는 코드가 와도 아래에서 일반 문구로 폴백하므로 깨지지는 않는다. 다만 "토큰이
 * 만료됐으니 다시 연동하라"처럼 사용자가 할 행동이 있는 경우에 그 안내를 못 하게 되므로,
 * ErrorCode에 GITHUB_* 가 추가되면 여기도 같이 채워야 한다.
 */
const REASON_MESSAGES: Record<string, string> = {
  INVALID_STATE: '요청이 만료되었습니다. 다시 시도해주세요.',
  ACCESS_DENIED: 'GitHub 연동이 취소되었습니다.',
  NO_CODE: 'GitHub 응답이 올바르지 않습니다. 다시 시도해주세요.',
  GITHUB_ALREADY_CONNECTED: '이미 다른 계정에 연동된 GitHub 계정입니다.',
  GITHUB_INVALID_CODE: 'GitHub 인증에 실패했습니다. 다시 시도해주세요.',
  GITHUB_TOKEN_EXPIRED: 'GitHub 접근 권한이 만료되었습니다. 다시 연동해주세요.',
  GITHUB_USER_NOT_FOUND: 'GitHub 사용자를 찾을 수 없습니다.',
  GITHUB_SERVER_ERROR: 'GitHub 연동 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  COMMON_SERVER_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
}

/**
 * GitHub 연동 결과 복귀 처리 — 백엔드가 OAuth 왕복을 끝내고 ?github=connected 또는
 * ?github=failed&reason=...를 붙여 이 페이지로 돌려보낼 때 토스트로 보여준다.
 *
 * 홈(FeedPage)·프로필(ProfilePage) 둘 다 이 훅을 쓴다 — INVALID_STATE는 사용자를
 * 특정 못 해 백엔드가 프로필이 아니라 홈으로 보내기 때문에(명세서), 어느 쪽으로
 * 돌아오든 처리할 수 있어야 한다.
 *
 * StrictMode 이중 실행 방지 패턴은 OAuthCallbackPage(구글)와 같다.
 */
export function useGithubConnectResult() {
  const [searchParams, setSearchParams] = useSearchParams()
  const show = useToastStore((state) => state.show)
  const hasHandled = useRef(false)

  useEffect(() => {
    if (hasHandled.current) return
    const result = searchParams.get('github')
    if (!result) return
    hasHandled.current = true

    if (result === 'connected') {
      show('success', 'GitHub 계정이 연동되었습니다.')
    } else {
      const reason = searchParams.get('reason')
      show('error', (reason && REASON_MESSAGES[reason]) || '연동에 실패했습니다.')
    }
    // 새로고침 때 토스트가 다시 뜨지 않도록 쿼리 정리.
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, show])
}

import { getGithubAuthorizeUrl } from './api'

/**
 * GitHub 인증 화면으로 브라우저를 통째로 이동시킨다(SPA 네비게이션 아님) — axios로
 * GitHub 인증 URL을 부르면 CORS로 막히고 승인 화면도 안 뜬다.
 *
 * 2026-08-05 백엔드 설계 변경: authorize_url 자체를 서버가 만들어서 내려준다
 * (GET /api/github/authorize) — client_id·scope·state(CSRF 방지)를 전부 서버가
 * 관리한다. 그래서 프론트엔 예전에 있던 state 생성·저장·대조 로직, VITE_GITHUB_CLIENT_ID,
 * GitHub 전용 콜백 라우트가 전혀 없다 — GitHub은 이제 우리 프론트로 절대 안 돌아오고
 * 백엔드 콜백 엔드포인트로 바로 간 뒤, 백엔드가 처리를 끝내고 ?github=connected 또는
 * ?github=failed&reason=...를 붙여 프론트(홈 또는 프로필)로 돌려보낸다
 * (features/profile/useGithubConnectResult.ts 참고).
 */
export async function redirectToGithubAuthorize() {
  const url = await getGithubAuthorizeUrl()
  window.location.href = url
}

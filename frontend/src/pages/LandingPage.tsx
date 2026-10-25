import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'

import { markIntroDone } from '@/features/landing/session'

/**
 * 랜딩만 따로 내려받는다.
 *
 * 정적 import면 `HeroLanding`(925줄)과 `hero-landing.css`(648줄)가 진입 청크에 합쳐져서
 * **모든 라우트가** 받는다 — 피드만 보는 사람도, 채팅만 쓰는 사람도 한 번도 안 볼 코드를
 * 받는다. 실측 JS +9.8 kB / CSS +10.6 kB. 로그인 화면의 큐브를 `lazy()`로 끊어 둔 것과
 * 같은 이유이고(BrandPanel 주석 참고), 랜딩은 라우트 하나뿐이라 이 경계 하나로 끝난다.
 */
const HeroLanding = lazy(() => import('@/features/landing/HeroLanding'))

/**
 * 청크를 받는 동안 깔아 두는 바탕.
 *
 * 색은 `hero-landing.css`의 `.hero-landing__auth-wait` 배경과 같은 값이다. 랜딩은 테마
 * 토큰을 쓰지 않는 어두운 연출 화면이라 이 파일도 같은 리터럴을 쓴다 — 여기서 토큰을
 * 쓰면 라이트 테마에서 흰 화면이 번쩍인 뒤 검은 랜딩이 덮는다. CSS가 lazy 청크에 함께
 * 들어가므로 클래스가 아니라 인라인 스타일이어야 한다(청크가 오기 전엔 클래스가 없다).
 */
const INTRO_BACKDROP = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: '#020202',
} as const

/**
 * 인트로 랜딩 화면(`/welcome`).
 *
 * 라우터 **안에** 있는 것이 요점이다. 예전에는 `RouterProvider`를 감싸는 게이트였는데,
 * 그러면 랜딩이 자기 히스토리 엔트리를 못 가져서 로그인 화면에서 뒤로가기를 누르면
 * 랜딩을 건너뛰고 사이트 밖으로 나갔고, 라우트 변경에도 반응하지 못했다.
 */
export default function LandingPage() {
  const navigate = useNavigate()

  function handleComplete() {
    markIntroDone()
    // `replace`가 아니라 push다. 랜딩과 로그인이 각자 히스토리 엔트리를 가져야
    // 로그인 화면에서 뒤로가기를 눌렀을 때 여기로 돌아온다.
    navigate('/login')
  }

  return (
    <Suspense fallback={<div style={INTRO_BACKDROP} />}>
      <HeroLanding onComplete={handleComplete} />
    </Suspense>
  )
}

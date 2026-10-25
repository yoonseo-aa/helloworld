/**
 * GitHub 연동 버튼 — 브랜드 가이드(brand.github.com/foundations/logo)를 따른다.
 *
 * 구글과 달리 GitHub은 완성된 "Sign in with GitHub" 버튼 에셋을 배포하지 않는다.
 * 가이드가 정하는 건 **마크뿐**이고 버튼 자체는 우리가 디자인한다:
 *  - 마크는 "흰색, 검정, 드물게 회색 또는 녹색"만 허용 → 검정 배경이라 흰색을 쓴다.
 *  - "압축·왜곡·기울이기·늘리기 금지", "색·치수 변경 금지" → path를 그대로 두고
 *    currentColor로 색만 흰색이 되게 한다(마크 형태는 건드리지 않는다).
 *  - clear space 규정이 있어 마크 주위에 넉넉한 여백을 둔다.
 *
 * 구체적 hex는 GitHub이 공개하지 않는다. 배경은 GitHub UI의 기본 전경색 계열인
 * #1F2328을 쓰고, 마크는 규정대로 순백으로 둔다.
 *
 * 다크 모드에서는 이 배경이 우리 표면색(#1c1e22)과 거의 같아 버튼 윤곽이 사라진다.
 * 배경을 바꾸면 브랜드 색을 건드리는 셈이라, 대신 흰 테두리를 얇게 둘러 경계만 만든다
 * (라이트에서는 투명 테두리라 크기가 동일하다).
 *
 * 지금 쓰는 곳은 프로필 화면(GithubSummary의 미연동 안내) 한 곳이다 — 온보딩 단계로
 * 있던 /settings/github 화면이 없어지면서 두 번째 사용처가 사라졌다. 버튼 자체는 브랜드
 * 가이드를 지켜야 하는 덩어리라 그대로 컴포넌트로 남긴다.
 */
export default function GithubConnectButton({
  onClick,
  label = 'GitHub 연동',
  className = '',
}: {
  onClick: () => void
  /** 온보딩에서는 "GitHub 연동하기"처럼 문구가 조금 다르다 */
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[46px] items-center justify-center gap-2.5 rounded-md border border-transparent bg-[#1F2328] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#32383F] dark:border-white/25 ${className}`}
    >
      {/* 공식 Invertocat 마크 — public/icons.svg의 github-icon과 같은 path.
          fill을 currentColor로 두어 버튼 글자색(흰색)을 그대로 따른다. */}
      <svg width="20" height="20" viewBox="0 0 19 19" aria-hidden>
        <path
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
        />
      </svg>
      {label}
    </button>
  )
}

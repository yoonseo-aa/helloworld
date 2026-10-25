import type { SVGProps } from 'react'

/**
 * 공통 셸 아이콘 — 시안(front.zip handoff icons.tsx)의 Lucide path 그대로.
 * lucide-react를 추가하지 않고 인라인으로 쓴다(새 라이브러리는 팀 합의 필요 — CLAUDE.md).
 * AppLayout(레일·탭바)과 SearchBar가 같이 쓰므로 components/에 둔다(두 번째 사용처 규칙).
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const base = (size: number | undefined, rest: SVGProps<SVGSVGElement>, strokeWidth = 1.7) => ({
  width: size ?? 24,
  height: size ?? 24,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  ...rest,
})

/** 레일·탭바 아이콘 — 현재 위치면 채워진다. */
type NavIconProps = IconProps & { active?: boolean }

/**
 * 활성 항목 아이콘의 채움. 값은 시안 icons.tsx의 `User`가 쓰던 그대로다 —
 * 면은 accent(--color-brand), 선은 accent-700(--color-brand-strong).
 *
 * 시안은 이 처리를 프로필 타일 하나에만 걸지만 우리는 **레일·탭바 전 항목**에 건다
 * (2026-08-08 결정). 예전엔 반대로 프로필의 채움을 빼서 통일했는데(2026-08-05),
 * 선 색만 바뀌는 표시는 아이콘이 작아질수록(탭바 22px) 켜졌는지 알아보기 어려웠다.
 */
const activeFill = (active: boolean | undefined) =>
  active
    ? // 속성(fill="...")이 아니라 **style**로 준다. SVG 프레젠테이션 속성에 들어간 var()는
      // CSS 선언만큼 안정적으로 해석되지 않아서, 테마 전환으로 변수가 보간되는 동안
      // 값이 잠깐 무효가 되고 fill이 SVG 기본값(검정)으로 떨어졌다 — 토글할 때마다
      // 활성 아이콘이 검게 번쩍였다. style은 정식 CSS 선언이라 보간을 그대로 따라간다.
      { style: { fill: 'var(--color-brand)', stroke: 'var(--color-brand-strong)' } }
    : undefined

/** 브랜드 마크 — 패키지 큐브 + 브랜드 컬러 도트. */
export function BrandMark({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size, rest, 1.4)}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <circle cx="12" cy="12" r="1.7" fill="var(--color-brand)" stroke="none" />
    </svg>
  )
}

export function Home({ active, size, ...rest }: NavIconProps) {
  return (
    <svg {...base(size, rest)} {...activeFill(active)}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

export function Bell({ active, size, ...rest }: NavIconProps) {
  return (
    <svg {...base(size, rest)} {...activeFill(active)}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  )
}

export function Send({ active, size, ...rest }: NavIconProps) {
  return (
    <svg {...base(size, rest)} {...activeFill(active)}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  )
}

export function Heart({ active, size, ...rest }: NavIconProps) {
  return (
    <svg {...base(size, rest, 1.8)} {...activeFill(active)}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

export function User({ active, size, ...rest }: NavIconProps) {
  return (
    <svg {...base(size, rest)} {...activeFill(active)}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

/** 게시글 작성 — 라우트가 아니라 모달이라 활성 표시를 하지 않는다(채움 없음). */
export function SquarePlus(p: IconProps) {
  return (
    <svg {...base(p.size, p)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  )
}

export function LogOut(p: IconProps) {
  return (
    <svg {...base(p.size, p)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

/** 다크 → 라이트 전환 버튼용 (시안 icons.tsx Sun). */
export function Sun(p: IconProps) {
  return (
    <svg {...base(p.size, p, 1.75)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  )
}

/** 라이트 → 다크 전환 버튼용 (시안 icons.tsx Moon). */
export function Moon(p: IconProps) {
  return (
    <svg {...base(p.size, p)}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

export function Search(p: IconProps) {
  return (
    <svg {...base(p.size, p, 1.8)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

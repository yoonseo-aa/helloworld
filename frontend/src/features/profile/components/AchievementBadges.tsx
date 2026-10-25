import { useState, type CSSProperties } from 'react'
import { useThemeAttr } from '../../../hooks/useThemeAttr'
import { ACHIEVEMENT_ICONS } from '../achievement-icons'
import { badgeSplit } from '../row-fit'
import type { Achievement, AchievementTier } from '../achievements'
// 타일·툴팁·카운터 키프레임(hw-bpop / hw-tip-* / hw-conf / hw-cpopA·B / hw-ringA·B /
// hw-cshiver / hw-cfinal)이 전부 여기 있다.
import '../profile.css'

/**
 * 업적 배지 — 48×48 3D 타일 + 티어별 툴팁 + `+N` 인트로 카운트업.
 * handoff 시안(`handoff/src/features/profile/components/AchievementBadges.tsx`) 이식본.
 *
 * **보유한 배지를 전부** 보여주고, 순서는 축과 무관하게 **티어 내림차순**이다
 * (골드 → 실버 → 브론즈). 정렬은 achievements.ts의 sortAchievements가 맡는다.
 *
 * 한 줄에 안 들어가면 명세 4절 `badgeSplit`대로 접는다 — B_MAX = max(3, ⌊(rowW+10)/58⌋)
 * 개까지 타일로 두고 나머지는 `+N` 타일 하나로 모은 뒤, 호버하면 목록을 펼친다.
 * 축 3개 × 티어 3단 = 최대 9개까지 나올 수 있어 모바일 폭에서는 실제로 접힌다.
 *
 * 목록·폭·인트로 상태는 전부 **페이지가 내려 준다**. 접힌 개수(`bRest`)가 곧 카운트업의
 * 목표치라서 페이지의 타임라인(useProfileIntro)과 같은 수를 봐야 하고, 폭은 태그 행과
 * 공유해야 두 줄의 오른쪽 끝이 맞기 때문이다(row-fit.ts 주석).
 */

/** 티어별 타일 팔레트 — [라이트, 다크]. off/on은 호버 전후. 시안 PAL 그대로. */
const PAL: Record<AchievementTier, [Record<string, string>, Record<string, string>]> = {
  BRONZE: [
    { off: 'linear-gradient(180deg,#f7dfc7 0%,#d3a068 100%)', on: 'linear-gradient(180deg,#fef0e0 0%,#e0b27d 100%)', bdOff: '#d6a172', bdOn: '#c2854a', sh: '#b8834b', fill: '#a4611f', strOff: '#8f5619', strOn: '#6f4210' },
    { off: 'linear-gradient(180deg,#3d2d1f 0%,#241a12 100%)', on: 'linear-gradient(180deg,#503a26 0%,#2c2015 100%)', bdOff: '#57402a', bdOn: '#7c5a36', sh: '#141010', fill: 'rgba(226,173,118,.92)', strOff: '#d9a273', strOn: '#f2c79c' },
  ],
  SILVER: [
    { off: 'linear-gradient(180deg,#f8f9fb 0%,#c7ccd4 100%)', on: 'linear-gradient(180deg,#ffffff 0%,#dde1e8 100%)', bdOff: '#c1c6cf', bdOn: '#a7aeb9', sh: '#a8aeb8', fill: '#6f7682', strOff: '#5f6673', strOn: '#454b56' },
    { off: 'linear-gradient(180deg,#343941 0%,#1f2226 100%)', on: 'linear-gradient(180deg,#434952 0%,#262a30 100%)', bdOff: '#4b515a', bdOn: '#6b7280', sh: '#101215', fill: 'rgba(206,212,222,.92)', strOff: '#c3c9d3', strOn: '#e6eaf0' },
  ],
  GOLD: [
    { off: 'linear-gradient(180deg,#ffeec6 0%,#f0be5a 100%)', on: 'linear-gradient(180deg,#fff8de 0%,#f6ce7c 100%)', bdOff: '#e4ae44', bdOn: '#d29a30', sh: '#c8912f', fill: '#b8801c', strOff: '#8a5e12', strOn: '#6b480b' },
    { off: 'linear-gradient(180deg,#4a3a1c 0%,#2a2113 100%)', on: 'linear-gradient(180deg,#5e4924 0%,#332818 100%)', bdOff: '#6b5227', bdOn: '#8f6e34', sh: '#151109', fill: 'rgba(255,214,142,.94)', strOff: '#f2c977', strOn: '#ffe1a8' },
  ],
}

const HIT: CSSProperties = { position: 'relative', width: 48, height: 48, flex: 'none', borderRadius: 13, cursor: 'pointer', display: 'inline-block', WebkitTapHighlightColor: 'transparent' }
const TILE_BOX: CSSProperties = { position: 'relative', display: 'flex', lineHeight: 0, flex: 'none', width: 48, height: 48 }

/** 명세 5.1 — 업적 타일 i번째는 210 + i×105 ms에 등장한다. */
const B_BASE = 210
const tileIn = (i: number) =>
  `hw-bpop .52s cubic-bezier(.24,1.45,.4,1) ${B_BASE + i * 105}ms both`

/** 인트로가 끝난 뒤의 `+N` 숫자 색 (명세 5.3). 램프의 도착점이기도 하다. */
const REST_NUM_COLOR = 'color-mix(in srgb, var(--color-ink) 55%, var(--color-surface-muted))'

/**
 * 호버 시 속을 채워도 되는 아이콘. **닫힌 실루엣 한 덩어리로 된 것만** 넣는다.
 *
 * 채움은 svg 전체에 fill을 거는 방식이라(아래 tileStyle의 ic.fill) 패스 모양을 탄다.
 * 예컨대 trophy는 패스 6개 중 컵만 닫혀 있고 손잡이·받침·다리는 열린 선이라, 채우면
 * 컵만 칠해지고 나머지는 윤곽선으로 남아 "덜 채워진" 것처럼 보인다. target은 반대로
 * 동심원 셋이 전부 칠해져 링이 뭉개진다.
 *
 * 그래서 목록에 없는 아이콘(trophy·book·check·eye·target·send·cube·code)은 채우지 않고
 * 선 색을 진하게 + 살짝 굵게 해서 호버를 표현한다. 연출은 갈리지만 깨져 보이진 않는다.
 * 전부 채우려면 아이콘마다 solid 버전 패스를 따로 그려야 한다(Lucide엔 solid 세트가 없다).
 */
const FILLABLE_ICONS = new Set(['flame', 'bolt', 'star', 'heart', 'msg', 'moon', 'shield'])

/** 타일 배경/그림자 + 아이콘 fill·stroke. 호버 시 3px 떠오르고 아이콘이 강조된다. */
function tileStyle(
  tier: AchievementTier,
  dark: boolean,
  on: boolean,
  icon: string,
): { st: CSSProperties; ic: CSSProperties } {
  const fillable = FILLABLE_ICONS.has(icon)
  const c = PAL[tier][dark ? 1 : 0]
  return {
    st: {
      position: 'absolute', inset: 0, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      transition: 'transform .22s cubic-bezier(.22,.9,.3,1), box-shadow .22s ease, border-color .22s ease, background .28s ease',
      transform: on ? 'translateY(-3px)' : 'translateY(0)',
      background: on ? c.on : c.off,
      border: '1px solid ' + (on ? c.bdOn : c.bdOff),
      boxShadow: on
        ? '0 5px 0 ' + c.sh + ', 0 12px 22px rgba(20,15,5,' + (dark ? '.5' : '.22') + '), inset 0 1px 0 rgba(255,255,255,' + (dark ? '.18' : '.8') + ')' + (tier === 'GOLD' ? ', 0 0 0 4px rgba(233,180,84,.22), 0 0 26px rgba(240,186,80,.45)' : '')
        : '0 3px 0 ' + c.sh + ', 0 6px 12px rgba(20,15,5,' + (dark ? '.42' : '.16') + '), inset 0 1px 0 rgba(255,255,255,' + (dark ? '.12' : '.65') + ')',
    },
    ic: {
      fill: on && fillable ? c.fill : 'rgba(0,0,0,0)',
      stroke: on ? c.strOn : c.strOff,
      // 못 채우는 아이콘은 선을 굵혀서 같은 "진해지는" 인상을 만든다.
      strokeWidth: on && !fillable ? 2.3 : 1.9,
      transition:
        'fill .34s cubic-bezier(.3,.8,.35,1), stroke .24s ease, stroke-width .24s ease, transform .24s ease',
      transform: on ? 'scale(1.08)' : 'scale(1)',
    },
  }
}

/** 골드 툴팁 콘페티 — [left offset, 상승거리, 좌우이동, w, h, 색, 회전시드] */
const CONF: Array<[number, number, number, number, number, string, number]> = [
  [-6, 58, -74, 7, 4, '#ffd98a', 2], [14, 46, -96, 5, 5, '#fff1cf', 9], [34, 70, -62, 8, 3, '#f0b45a', 4],
  [56, 40, -102, 4, 4, '#ffffff', 6], [78, 66, -70, 7, 4, '#ffd98a', 3], [98, 44, -88, 5, 5, '#e0863c', 8],
  [-2, 30, 66, 6, 4, '#f0b45a', 5], [22, 24, 84, 4, 4, '#fff1cf', 7], [48, 22, 58, 7, 3, '#ffd98a', 2],
  [72, 26, 78, 5, 5, '#ffffff', 9], [92, 20, 62, 6, 4, '#f0b45a', 4], [110, 34, 92, 4, 4, '#ffd98a', 6],
  [-14, 12, -40, 5, 5, '#e0863c', 3], [120, 14, 48, 6, 3, '#fff1cf', 8],
]

function Tooltip({ a, dark, reduce }: { a: Achievement; dark: boolean; reduce: boolean }) {
  const base: CSSProperties = {
    position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', zIndex: 30,
    minWidth: 192, padding: '11px 13px 10px', borderRadius: 8, pointerEvents: 'none',
    background: dark ? '#2a1b0d' : 'var(--color-ink)', border: '1px solid ' + (dark ? '#4a3a22' : 'transparent'),
    boxShadow: '0 6px 18px rgba(180,90,10,.35)', color: '#fff', textAlign: 'left',
  }
  // 브론즈는 담백한 다크 툴팁 — 실버/골드만 화려하게 차별화하는 게 시안 의도다.
  if (a.tier === 'BRONZE') {
    return (
      <div role="tooltip" style={{ ...base, ...(reduce ? {} : { animation: 'hw-tip-in .18s cubic-bezier(.2,.85,.3,1) both' }) }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, lineHeight: 1.4, letterSpacing: '-0.01em' }}>{a.name}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.6, marginTop: 4, color: 'rgba(255,255,255,.92)', wordBreak: 'keep-all' }}>{a.detail}</div>
        <div style={{ fontSize: 9.5, lineHeight: 1.5, letterSpacing: '0.06em', marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,.35)', color: 'rgba(255,255,255,.78)' }}>{a.progress}</div>
      </div>
    )
  }
  const gold = a.tier === 'GOLD'
  const tip: CSSProperties = {
    ...base,
    minWidth: gold ? 240 : 214, padding: gold ? '15px 18px 14px' : '13px 15px 12px', borderRadius: 12,
    bottom: gold ? 'calc(100% + 15px)' : 'calc(100% + 13px)',
    background: gold ? 'linear-gradient(158deg, #4a3410 0%, #2b1d09 52%, #180f06 100%)' : 'linear-gradient(158deg, #33383e 0%, #21252a 54%, #14171a 100%)',
    border: gold ? '1px solid #e2b155' : '1px solid #c3ccd6',
    boxShadow: gold
      ? '0 18px 40px rgba(120,72,6,.42), 0 0 0 4px rgba(226,177,85,.2), 0 0 22px rgba(255,196,84,.22), inset 0 1px 0 rgba(255,229,170,.34)'
      : '0 14px 32px rgba(40,52,66,.38), 0 0 0 3px rgba(195,204,214,.14), inset 0 1px 0 rgba(255,255,255,.22)',
    color: gold ? '#ffeecb' : '#eef2f6', willChange: 'transform', backfaceVisibility: 'hidden',
    ...(reduce ? {} : { animation: 'hw-tip-gold .34s cubic-bezier(.18,.9,.28,1.04) both' }),
  }
  // 제목은 금속 그라디언트를 텍스트에 클립하고 천천히 맥동시킨다(hw-tip-pop).
  const titleSt: CSSProperties = {
    position: 'relative', display: 'block', width: 'fit-content', fontFamily: 'var(--font-sans)', fontWeight: 700,
    fontSize: gold ? 16 : 14.5, lineHeight: 1.4, letterSpacing: gold ? '-0.015em' : '-0.012em', marginTop: gold ? 5 : 4,
    backgroundImage: gold ? 'linear-gradient(178deg, #fff6dc 8%, #f7d18a 52%, #e0a63f 100%)' : 'linear-gradient(178deg, #ffffff 8%, #dfe6ee 50%, #a9b6c4 100%)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    textShadow: gold ? '0 1px 0 rgba(0,0,0,.25), 0 1px 5px rgba(255,196,84,.3)' : '0 1px 0 rgba(0,0,0,.22), 0 1px 4px rgba(198,214,232,.24)',
    backfaceVisibility: 'hidden',
    ...(reduce ? {} : { transformOrigin: 'center center', willChange: 'transform', animation: `hw-tip-pop ${gold ? '3.2s' : '3.6s'} cubic-bezier(.3,1.5,.4,1) ${gold ? '.18s' : '.2s'} infinite` }),
  }
  return (
    <div role="tooltip" style={tip}>
      {gold && !reduce && CONF.map((c, i) => (
        <span key={i} style={{
          position: 'absolute', left: 30 + c[0], top: 44, width: c[3], height: c[4],
          borderRadius: i % 3 === 0 ? '50%' : 1, background: c[5], pointerEvents: 'none', zIndex: 2,
          '--tx': c[2] * 0.34 + 'px', '--ty': -c[1] + 'px', '--rot': c[6] * 47 - 120 + 'deg',
          animation: `hw-conf ${(0.72 + (i % 5) * 0.07).toFixed(2)}s cubic-bezier(.14,.7,.32,1) ${(0.16 + (i % 4) * 0.03).toFixed(2)}s both`,
        } as CSSProperties} />
      ))}
      <div style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 8.5, lineHeight: 1.5,
        letterSpacing: '0.16em', textTransform: 'uppercase', color: gold ? '#f5cd83' : '#dbe3ec',
        padding: '1.5px 6px', borderRadius: 999, border: '1px solid ' + (gold ? 'rgba(240,196,115,.38)' : 'rgba(210,220,232,.36)'), background: gold ? 'rgba(255,205,120,.1)' : 'rgba(220,230,242,.1)',
      }}>{gold ? '★ Gold' : '◆ Silver'}</div>
      <div style={titleSt}>{a.name}</div>
      <div style={{ position: 'relative', transform: 'translateZ(0)', backfaceVisibility: 'hidden', fontFamily: 'var(--font-sans)', fontSize: gold ? 12.5 : 12, lineHeight: gold ? 1.7 : 1.65, marginTop: gold ? 6 : 5, color: gold ? 'rgba(255,238,208,.9)' : 'rgba(236,242,248,.88)', wordBreak: 'keep-all' }}>{a.detail}</div>
      <div style={{ position: 'relative', transform: 'translateZ(0)', backfaceVisibility: 'hidden', fontSize: gold ? 10 : 9.5, lineHeight: 1.5, letterSpacing: '0.1em', marginTop: gold ? 9 : 8, paddingTop: gold ? 8 : 7, borderTop: '1px solid ' + (gold ? 'rgba(232,186,100,.34)' : 'rgba(197,208,220,.3)'), color: gold ? '#f0c473' : '#c9d4e0' }}>{a.progress}</div>
      {/* 말풍선 꼬리 — 타일을 가리키는 45° 회전 사각형 */}
      <div style={{ position: 'absolute', left: '50%', bottom: -6, width: gold ? 11 : 10, height: gold ? 11 : 10, marginLeft: gold ? -5.5 : -5, transform: 'rotate(45deg)', background: gold ? 'linear-gradient(135deg, #241708 0%, #180f06 100%)' : 'linear-gradient(135deg, #1b1f23 0%, #14171a 100%)', borderRight: '1px solid ' + (gold ? '#e2b155' : '#c3ccd6'), borderBottom: '1px solid ' + (gold ? '#e2b155' : '#c3ccd6') }} />
    </div>
  )
}

/** `+N` 패널의 티어 점 색 (명세 9절 TDOT). */
const TIER_DOT: Record<AchievementTier, string> = {
  GOLD: '#cf9c2c',
  SILVER: '#8d939d',
  BRONZE: '#b3814e',
}

export default function AchievementBadges({
  ach,
  rowW,
  intro,
  moreN,
  reduce,
}: {
  ach: Achievement[]
  /** 태그 행과 공유하는 실측 폭 — 접을 개수를 정한다. */
  rowW: number
  /** 페이지 인트로 진행 중 여부 (명세 5절). */
  intro: boolean
  /** `+N` 카운터의 현재 값. 인트로가 굴리는 값이라 페이지가 소유한다. */
  moreN: number
  reduce: boolean
}) {
  const [hover, setHover] = useState(-1)
  const [moreOpen, setMoreOpen] = useState(false)
  const [restHover, setRestHover] = useState(-1)
  /** `+N` 패널이 헤더 아래 여유 공간에 맞춰 보여줄 행 수 (명세 4절). */
  const [moreRows, setMoreRows] = useState(8)
  /** 우측 공간이 부족하면 설명 툴팁을 왼쪽으로 뒤집는다. */
  const [moreFlip, setMoreFlip] = useState(false)
  const dark = useThemeAttr()

  const { rest } = badgeSplit(ach.length, rowW)
  const visible = ach.slice(0, ach.length - rest)
  const hidden = ach.slice(ach.length - rest)
  const hiddenRows = hidden.slice(0, moreRows)

  // 카운트업이 실제로 돌았는가. 업적이 1350ms 뒤에 도착하면 인트로는 카운트업을 건너뛰므로
  // (useProfileIntro 주석) 그때는 연출 없이 최종 "+N"을 바로 그린다.
  const counted = moreN >= 2
  // 인트로 연출(색 램프·링·팝)을 적용할지 — 인트로가 끝나면 상시 스타일로 넘어간다(명세 5.3).
  const counting = intro && counted && !reduce
  /**
   * 화면에 찍는 숫자. **연출이 도는 동안만** 카운트업 값(moreN)을 쓰고, 끝나면 실제로
   * 접힌 개수(rest)로 돌아간다.
   *
   * 예전엔 '한 번이라도 돌았나(counted)'로 갈라서 연출이 끝난 뒤에도 moreN에 머물렀다.
   * moreN은 카운트업이 돌던 시점의 rest에서 얼어붙는데 연출은 한 번만 도므로, 창을 좁혀
   * 접히는 개수가 늘면(5 → 7) 화면은 계속 '+5'였다. 바로 아래 aria-label은 rest를 써서
   * 스크린리더만 '7개 더 보기'라고 읽는 어긋남까지 있었다.
   */
  const moreShown = counting ? Math.max(1, Math.min(moreN, rest)) : rest

  const cProg = rest > 1 ? Math.min(1, (moreShown - 1) / (rest - 1)) : 1
  const cRamp = Math.pow(cProg, 1.15)
  const cDone = counted && rest > 0 && moreN >= rest
  const cHold = counted && rest > 2 && moreN === rest - 1
  const moreOnHover = moreOpen

  // `+N` 타일 (dashed). 인트로 중에는 카운트 진행에 따라 액센트가 차오른다.
  let moreSt: CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    transition: 'transform .22s cubic-bezier(.22,.9,.3,1), box-shadow .22s ease, border-color .22s ease, background .28s ease',
    transform: moreOnHover ? 'translateY(-3px)' : 'translateY(0)',
    border: '1px dashed ' + (moreOnHover ? 'var(--color-brand)' : dark ? '#4a4438' : '#d8cfc2'),
    background: moreOnHover ? (dark ? 'rgba(242,130,36,.14)' : 'var(--color-brand-subtle)') : 'transparent',
    fontFamily: 'var(--font-mono)', fontSize: 12,
    color: moreOnHover ? 'var(--color-brand-strong)' : REST_NUM_COLOR,
    boxShadow: moreOnHover ? (dark ? '0 6px 16px rgba(0,0,0,.4)' : '0 6px 16px rgba(180,110,30,.18)') : 'none',
  }
  if (counting && rest > 0 && !moreOnHover) {
    moreSt = {
      ...moreSt,
      border: `1px dashed color-mix(in srgb, var(--color-brand) ${Math.round(8 + 84 * cRamp)}%, ${dark ? '#4a4438' : '#d8cfc2'})`,
      background: `color-mix(in srgb, var(--color-brand) ${(1.5 + 11 * cRamp).toFixed(1)}%, transparent)`,
      transition: 'transform .22s cubic-bezier(.22,.9,.3,1)',
      boxShadow: cRamp > 0.06 ? `0 0 ${(4 + 15 * cRamp).toFixed(1)}px color-mix(in srgb, var(--color-brand) ${Math.round(6 + 32 * cRamp)}%, transparent)` : 'none',
    }
  }

  // 래퍼 애니메이션은 인트로 플래그가 아니라 `counted`로 가른다 — intro가 false로 뒤집힐 때
  // 애니메이션 문자열이 바뀌면 브라우저가 그걸 새 애니메이션으로 보고 타일을 한 번 더
  // 튀게 만든다. counted는 카운트업이 끝난 뒤에도 값이 유지돼 문자열이 그대로 남는다.
  const moreWrapSt: CSSProperties = {
    ...TILE_BOX,
    ...(reduce
      ? {}
      : cDone
        ? { willChange: 'transform', animation: 'hw-cfinal .78s cubic-bezier(.22,1.45,.36,1) both' }
        : counted
          ? {} // 카운트업 중 — 숫자와 링이 연출을 맡는다
          : { animation: tileIn(visible.length) }),
  }

  // 링 펄스 — 카운트가 오를 때마다 A/B를 교대로 걸어 같은 애니메이션 재시작 문제를 피한다.
  const moreRingSt: CSSProperties = counting
    ? ({
        position: 'absolute', left: 0, top: 0, width: 48, height: 48, boxSizing: 'border-box', borderRadius: 13,
        border: `${(1.5 + 0.9 * cRamp).toFixed(2)}px solid color-mix(in srgb, var(--color-brand) ${Math.round(62 + 38 * cRamp)}%, transparent)`,
        pointerEvents: 'none', transformOrigin: '50% 50%', willChange: 'transform, opacity',
        '--ro': (0.2 + 0.62 * cProg).toFixed(2), '--rs': (1.08 + 0.74 * Math.pow(cProg, 1.5)).toFixed(2),
        animation: `${moreN % 2 ? 'hw-ringA' : 'hw-ringB'} ${(0.4 + 0.5 * cProg).toFixed(2)}s cubic-bezier(.2,.7,.3,1) both`,
      } as CSSProperties)
    : { display: 'none' }

  // 숫자 — 인트로 중에는 키프레임으로 튀고(트랜지션 아님), 끝나면 상시 색으로 천천히 내려앉는다.
  const moreNumSt: CSSProperties = counting
    ? ({
        display: 'inline-block', transformOrigin: '50% 50%', willChange: 'transform', transition: 'none',
        color: `color-mix(in srgb, var(--color-brand) ${Math.round(16 + 84 * cRamp)}%, ${REST_NUM_COLOR})`,
        fontWeight: Math.round(500 + 100 * cRamp),
        '--cw0': String(Math.round(500 + 100 * cRamp)),
        '--cwp': String(Math.round(700 + 100 * cRamp)),
        '--cpk': (1.14 + 0.74 * Math.pow(cProg, 1.6)).toFixed(3),
        animation: cDone
          ? `${moreN % 2 ? 'hw-cpopA' : 'hw-cpopB'} .68s cubic-bezier(.16,1.9,.34,1) both`
          : cHold
            ? `${moreN % 2 ? 'hw-cpopA' : 'hw-cpopB'} .42s cubic-bezier(.2,1.7,.4,1) both, hw-cshiver .42s ease-in-out .44s 2 forwards`
            : `${moreN % 2 ? 'hw-cpopA' : 'hw-cpopB'} ${Math.min(0.56, Math.max(0.3, ((240 + 900 * Math.pow(cProg, 2.2)) * 0.72) / 1000)).toFixed(2)}s cubic-bezier(.2,1.75,.4,1) both`,
      } as CSSProperties)
    : {
        display: 'inline-block',
        fontWeight: 500,
        color: moreOnHover ? 'var(--color-brand-strong)' : REST_NUM_COLOR,
        transition: reduce
          ? 'none'
          : 'color .7s cubic-bezier(.3,.7,.3,1) .12s, font-weight .7s cubic-bezier(.3,.7,.3,1) .12s',
      }

  // `+N` 패널이 헤더를 뚫지 않도록 여유 공간을 재서 행 수를 정한다 (명세 4절).
  const openMore = (e: { currentTarget: Element }) => {
    const box = e.currentTarget.getBoundingClientRect()
    const header = document.querySelector('header')
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0
    const room = Math.max(70, Math.round(box.top - headerBottom - 12))
    setMoreRows(Math.max(1, Math.min(8, Math.floor((room - 56) / 31.5))))
    setMoreFlip(window.innerWidth - box.right < 232)
    setMoreOpen(true)
  }
  const closeMore = () => {
    setMoreOpen(false)
    setRestHover(-1)
  }

  // ⚠️ 훅보다 뒤에 둬야 훅 순서가 어긋나지 않는다.
  if (ach.length === 0) return null

  return (
    <div className="mt-[22px] flex max-w-[520px] flex-wrap items-center gap-2.5">
      {visible.map((a, i) => {
        const on = hover === i
        const t = tileStyle(a.tier, dark, on, a.icon)
        return (
          <div
            // 한 축이 여러 티어를 보유할 수 있어 axis만으로는 키가 겹친다.
            key={`${a.axis}-${a.tier}`}
            // 시안은 이 딜레이를 인트로에 묶지만 우리 업적은 API로 늦게 올 수 있다 —
            // 그래서 TechStackRow와 같은 규칙으로 "타일이 처음 그려지는 순간"을 기준 삼는다.
            style={reduce ? TILE_BOX : { ...TILE_BOX, animation: tileIn(i) }}
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`${a.axis} · ${a.name} — ${a.detail} ${a.progress}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(-1)}
              onClick={() => setHover(i)}
              style={{ ...HIT, pointerEvents: 'auto' }}
            >
              <div style={t.st}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={t.ic}>
                  {(ACHIEVEMENT_ICONS[a.icon] || ACHIEVEMENT_ICONS.star).map((d, di) => (
                    <path key={di} d={d} />
                  ))}
                </svg>
              </div>
            </div>
            {on && <Tooltip a={a} dark={dark} reduce={reduce} />}
          </div>
        )
      })}

      {rest > 0 && (
        <div style={moreWrapSt} onMouseEnter={openMore} onMouseLeave={closeMore}>
          <div
            role="button"
            tabIndex={0}
            aria-label={`업적 ${rest}개 더 보기`}
            onFocus={openMore}
            onBlur={closeMore}
            onClick={openMore}
            style={{ ...HIT, pointerEvents: 'auto' }}
          >
            <div style={moreSt}>
              <span style={moreNumSt}>+{moreShown}</span>
            </div>
          </div>
          <span aria-hidden style={moreRingSt} />

          {moreOpen && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 70, paddingBottom: 10, pointerEvents: 'auto' }}>
              <div
                role="tooltip"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 3, width: 'max-content', maxWidth: 210,
                  padding: '11px 13px', borderRadius: 8,
                  background: dark ? '#f28224' : '#ea700f',
                  border: '1px solid ' + (dark ? '#ffb066' : '#c25a06'),
                  boxShadow: '0 6px 18px rgba(180,90,10,.35)', color: '#fff', textAlign: 'left',
                  ...(reduce ? {} : { animation: 'hw-tip-rise .16s cubic-bezier(.2,.85,.3,1) both' }),
                }}
              >
                {hiddenRows.map((a, ri) => (
                  <div
                    key={`${a.axis}-${a.tier}`}
                    onMouseEnter={() => setRestHover(ri)}
                    onMouseLeave={() => setRestHover(-1)}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
                      fontFamily: 'var(--font-sans)', fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'nowrap',
                      color: restHover === ri ? '#fff' : 'rgba(255,255,255,.94)', cursor: 'default',
                      margin: '0 -7px', padding: '4px 7px', borderRadius: 6,
                      background: restHover === ri ? 'rgba(255,255,255,.2)' : 'transparent',
                      transition: 'background .15s ease',
                    }}
                  >
                    <span aria-hidden style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: TIER_DOT[a.tier] }} />
                    {a.name}
                    {restHover === ri && (
                      <div
                        role="tooltip"
                        style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 45,
                          left: moreFlip ? 'auto' : 'calc(100% + 12px)',
                          right: moreFlip ? 'calc(100% + 12px)' : 'auto',
                          minWidth: 132, maxWidth: 196, whiteSpace: 'normal', wordBreak: 'keep-all', pointerEvents: 'none',
                          fontFamily: 'var(--font-sans)', fontSize: 11.5, lineHeight: 1.6, textAlign: 'left',
                          padding: '8px 11px', borderRadius: 8,
                          background: '#fff', border: '1px solid ' + (dark ? '#ffb066' : '#c25a06'),
                          boxShadow: '0 6px 16px rgba(90,44,4,.28)', color: dark ? '#3a2408' : '#4a2c06',
                          ...(reduce ? {} : { animation: 'hw-tip-side .14s cubic-bezier(.2,.85,.3,1) both' }),
                        }}
                      >
                        {a.detail}
                      </div>
                    )}
                  </div>
                ))}
                {hidden.length > hiddenRows.length && (
                  <div style={{ fontSize: 10.5, lineHeight: 1.5, letterSpacing: '0.06em', marginTop: 5, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,.22)', color: 'rgba(255,255,255,.68)' }}>
                    +{hidden.length - hiddenRows.length}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

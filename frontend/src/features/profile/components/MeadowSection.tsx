import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { buildFieldModel } from '../meadow/model'
import { MeadowEngine } from '../meadow/engine'
import { FIELD_DEFS } from '../meadow/field-defs'
import { levelOf, mapToWindow } from '../contributions'
import { useThemeAttr } from '../../../hooks/useThemeAttr'
import type { UserGithubResponse } from '../types'
// field-defs.ts의 SVG 그라디언트가 이 CSS의 :root 변수를 참조한다. 이 파일이 이미
// React.lazy로 늦게 로드되므로(GithubSummary.tsx 참고), 여기서 같이 import해도 전역
// :root에 등록되는 효과는 동일하면서 초기 번들에는 안 실린다.
// (파일명이 meadow.css → profile.css로 바뀌었다 — 초원 팔레트뿐 아니라 업적 배지 툴팁
//  키프레임까지 들고 있어서 프로필 화면 공용이다. AchievementBadges.tsx도 같이 import한다.)
import '../profile.css'

/**
 * GitHub 활동 섹션 — 성장 초원(canvas) / 잔디(SVG) 토글. handoff 시안
 * (`handoff/src/features/profile/components/MeadowSection.tsx`, `meadow/*`)을 거의
 * 그대로 옮기되, 이 프로젝트에 없는 것들만 단순화했다:
 *  - `profile.meadow_seed` 필드가 실제 API에 없어 userId를 시드로 대신 쓴다
 *    (같은 유저 = 같은 초원이라는 요구사항은 그대로 충족).
 *  - mobile 분기용 전용 훅이 없어(두 번째 사용처 생기면 승격) 반응형 세부값은 생략.
 *  - 활동 패턴 프리셋(초안/견실/폭발)은 데모용이라 제거 — 항상 실 데이터만 그린다.
 *
 * 성장은 `active`가 true가 되는 순간 시작한다 — 명세 5.1대로 페이지 인트로가 이 섹션을
 * 공개하는 1350ms에 맞춰 자라야 한다. 마운트 즉시 자라게 두면 섹션이 아직 opacity 0인
 * 동안 성장이 끝나 버려서, 정작 보일 때는 다 자란 초원이 그냥 나타난다.
 *
 * field-defs.ts / model.ts / engine.ts는 절대 수정하지 않았다(팀 인계 문서 지시 —
 * 시드 난수 호출 순서·애니메이션 상수가 시안과 어긋나면 결과가 달라진다).
 */

const LV_L = ['#e9ecdf', '#cfe0a6', '#a9c96f', '#79a83c', '#f2a114', '#d1560a']
const LV_D = ['#242017', '#3f4a25', '#5c7233', '#86a83c', '#d8930f', '#b04705']
const MONTHS: Array<[string, number]> = [
  ['JAN', 42], ['FEB', 158], ['MAR', 303], ['APR', 419], ['MAY', 564], ['JUN', 680],
  ['JUL', 825], ['AUG', 941], ['SEP', 1057], ['OCT', 1202], ['NOV', 1318], ['DEC', 1463],
]

export default function MeadowSection({
  userId,
  githubData,
  active = true,
}: {
  userId: number
  githubData: UserGithubResponse
  /** 페이지 인트로가 이 섹션을 공개했는가 — true가 되는 순간 성장이 시작된다. */
  active?: boolean
}) {
  const [view, setView] = useState<'field' | 'grid'>('field')
  const [grown, setGrown] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const defsRef = useRef<SVGSVGElement>(null)
  const engineRef = useRef<MeadowEngine | null>(null)
  const engineAttached = useRef(false)

  const reduce = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  )
  // 이 프로젝트엔 테마 토글이 아직 없어 지금은 항상 false다. 나중에 <html data-theme>만
  // 세팅되면 캔버스(setDark)와 잔디 팔레트가 알아서 다크로 넘어간다.
  const dark = useThemeAttr()
  const realCounts = useMemo(() => mapToWindow(githubData.contributions), [githubData.contributions])

  const model = useMemo(
    () =>
      buildFieldModel({
        counts: realCounts,
        seed: userId,
        reduce,
        commitsHint: githubData.total_commits,
      }),
    [realCounts, userId, reduce, githubData.total_commits],
  )

  // 엔진 수명주기 — 마운트 1회 생성, 모델/활성 상태는 개별 이펙트로 동기화.
  useEffect(() => {
    const eng = new MeadowEngine({ reduce, onGrown: setGrown })
    engineRef.current = eng
    return () => {
      eng.destroy()
      engineRef.current = null
      engineAttached.current = false
    }
  }, [reduce])
  useEffect(() => {
    const eng = engineRef.current
    if (!eng || !canvasRef.current || !defsRef.current) return
    eng.setModel(model, { keepProgress: !engineAttached.current })
    if (!engineAttached.current) {
      eng.attach(canvasRef.current, defsRef.current)
      engineAttached.current = true
    }
  }, [model])
  // 테마 동기화 — 엔진은 light|dark 아틀라스를 따로 캐시해 두고 직전 프레임 스냅샷을
  // 620ms 크로스페이드한다(engine.setDark). 이 호출이 없으면 엔진의 dark가 영원히
  // false라서 CSS 변수만 다크로 바뀌고 캔버스 식물색은 라이트에 머문다.
  // (엔진 인스턴스는 reduce가 런타임에 바뀌지 않으므로 마운트당 1개뿐 — [dark]만 보면 된다)
  useEffect(() => {
    engineRef.current?.setDark(dark)
  }, [dark])
  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])

  // 잔디 뷰 데이터 (시안 gridNow: 밀도 배율 k로 셀 스케일)
  const grid = useMemo(() => {
    const k = 0.45 + model.dens * 1.35
    let tot = 0
    const cells = model.cells.map((c) => {
      const n = Math.min(99, Math.round(c.n * k))
      tot += n
      return { ...c, n, lv: levelOf(n), delay: ((6 - c.d) * 0.05 + c.w * 0.0016).toFixed(3) }
    })
    return { cells, tot }
  }, [model])

  const fieldMeta =
    view === 'grid'
      ? `${Math.min(99999, grid.tot).toLocaleString()} CONTRIBUTIONS`
      : `${model.commits.toLocaleString()} COMMITS · ${Math.round(model.actR * 371)} ACTIVE DAYS · ${model.cnt} PLANTS`

  const segBtn = (sel: boolean, i: number): CSSProperties => ({
    fontSize: 10,
    letterSpacing: '0.06em',
    padding: '5px 11px',
    border: 'none',
    borderLeft: i ? '1px solid var(--color-line)' : 'none',
    background: sel ? 'var(--color-brand-subtle)' : 'transparent',
    color: sel ? 'var(--color-brand-strong)' : 'var(--color-ink-subtle)',
    cursor: 'pointer',
    lineHeight: 1.15,
  })
  const isField = view === 'field'

  return (
    <section aria-label="깃허브 활동">
      {/* 명세 7절 — 제목·키커·메타·토글이 baseline으로 정렬된 **한 줄**이다.
          제목을 GithubSummary에 두면 메타가 아래 줄로 밀려 시안과 어긋나므로 여기서 그린다
          (미연동 안내 화면만 GithubSummary가 자기 제목을 따로 그린다). */}
      <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-2 md:min-h-[38px]">
        <h2 className="text-ink m-0 text-[17px] font-bold tracking-[-0.01em]">GitHub 활동</h2>
        <span className="text-ink/[.48] font-mono text-[10.5px] tracking-[0.14em]">
          LAST 12 MONTHS
        </span>
        <span className="text-brand-strong font-mono w-[352px] max-w-full flex-[0_1_auto] overflow-hidden text-[10.5px] whitespace-nowrap tabular-nums">
          {fieldMeta}
        </span>
        <div
          role="group"
          aria-label="보기 방식"
          className="border-line ml-auto flex overflow-hidden rounded-md border"
        >
          <button type="button" onClick={() => setView('field')} style={segBtn(isField, 0)}>
            초원
          </button>
          <button type="button" onClick={() => setView('grid')} style={segBtn(!isField, 1)}>
            잔디
          </button>
        </div>
      </div>

      <div className="relative mt-2.5">
        <div style={{ width: '100%', paddingTop: '21.25%', pointerEvents: 'none' }} />
        {/* 지면 워시 2겹(넓은 radial 워시 + 하단 흙 그라디언트). 스타일은 profile.css로 옮겼다 —
            테마 페이드(래퍼의 opacity transition)와 성장 리빌(자식의 animation)이 같은 요소에서
            opacity를 다투면 animation이 이기기 때문에 레이어를 나눠야 했다. */}
        {isField && grown && (
          <div aria-hidden className="hw-fld">
            <div className="hw-fld-wash" />
            <div className="hw-fld-base" />
          </div>
        )}
        {/* 숨김 defs 호스트 — 엔진이 getBBox 측정 + 아틀라스 소스로 사용 */}
        <svg
          ref={defsRef}
          aria-hidden
          focusable="false"
          style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: FIELD_DEFS }}
        />
        {/* 초원 캔버스 — 잔디 뷰에서는 display:none */}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="최근 1년 커밋 활동을 표현한 성장 초원"
          style={{ position: 'absolute', inset: 0, display: isField ? 'block' : 'none', width: '100%', height: '100%' }}
        />
        {!isField && (
          <svg
            viewBox="0 0 1600 340"
            role="img"
            aria-label="최근 1년 커밋 활동 잔디"
            style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              {LV_L.map((_, i) => (
                <linearGradient key={'l' + i} id={'cl' + i} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={['#f2f4ea', '#deecc0', '#bfdb8d', '#93c154', '#ffc046', '#f07527'][i]} />
                  <stop offset="1" stopColor={['#e2e7d5', '#c1d792', '#99bd5b', '#68982f', '#df9008', '#c14802'][i]} />
                </linearGradient>
              ))}
              {LV_D.map((_, i) => (
                <linearGradient key={'d' + i} id={'cd' + i} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={['#2c2719', '#4d5c2d', '#6f8c3d', '#9ec44a', '#f0a71a', '#ce5809'][i]} />
                  <stop offset="1" stopColor={['#1d1911', '#313b1c', '#495d26', '#6d8e2e', '#b67708', '#8d3502'][i]} />
                </linearGradient>
              ))}
            </defs>
            {MONTHS.map(([m, x]) => (
              <text
                key={m}
                x={x}
                y="98"
                fontFamily="var(--font-mono, monospace)"
                fontSize="16"
                letterSpacing="1.5"
                className="fill-ink-subtle"
              >
                {m}
              </text>
            ))}
            {([['MON', 162], ['WED', 220], ['FRI', 278]] as Array<[string, number]>).map(([d, y]) => (
              <text
                key={d}
                x="0"
                y={y}
                fontFamily="var(--font-mono, monospace)"
                fontSize="15"
                letterSpacing="1.2"
                className="fill-ink-subtle"
              >
                {d}
              </text>
            ))}
            {grid.cells.map((c, i) => (
              <rect
                key={i}
                x={c.x}
                y={c.y}
                width="24"
                height="24"
                rx="5"
                fill={`url(#${(dark ? 'cd' : 'cl') + c.lv})`}
                style={
                  reduce
                    ? { transformBox: 'fill-box', transformOrigin: '50% 100%' }
                    : {
                        transformBox: 'fill-box',
                        transformOrigin: '50% 100%',
                        animation: `hw-cellgrow 0.46s cubic-bezier(.22,.9,.3,1) ${c.delay}s both`,
                      }
                }
              >
                <title>{`${c.date} · ${c.n} commits`}</title>
              </rect>
            ))}
            <line x1="20" y1="339" x2="1580" y2="339" className="stroke-line" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
    </section>
  )
}

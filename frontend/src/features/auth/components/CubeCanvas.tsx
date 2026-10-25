import { useEffect, useRef, useState } from 'react'

import { useThemeAttr } from '@/hooks/useThemeAttr'
import { createCubeStage, isWebGL2Available, LOOK, type CubeStage } from '../cube'

/**
 * 3D 큐브 한 개를 컨테이너에 채운다.
 *
 * 엔진은 `features/auth/cube/`에 통째로 들어 있고 React를 전혀 모른다 — 캔버스 하나를
 * 받아서 자기 크기를 ResizeObserver로 재고, 테마는 이름으로 받는다. 이 파일이 하는 일은
 * 그 수명주기를 React 이펙트에 묶는 것뿐이다. 엔진 쪽 설명은 `cube/README.md`.
 *
 * (엔진을 feature 안에 둔 건 `features/profile/meadow/`와 같은 배치다 — 캔버스 엔진은
 * 그걸 쓰는 도메인 옆에 둔다. 두 번째 사용처가 생기면 그때 올린다.)
 *
 * 배경은 그리지 않는다(`backdrop: false`). 로그인 카드가 이미 `--color-surface`를 깔고
 * 있으므로 큐브는 그 위에 알파로 합성만 한다 — 테마를 바꾸면 카드 색이 바뀌고 큐브는
 * 그 위에 그대로 얹힌다.
 */
/*
 * 글로우 세기. 다크에서만 낮춘다.
 *
 * 엔진의 테마 전환은 배경과 dayAmount만 바꾸고 `bloomStrength`는 두 모드가 같다
 * (theme.ts의 applyCubeTheme 주석 참고). 그런데 다크는 배경이 #08070A라 같은 양의
 * 글로우가 훨씬 세게 읽히고, 큐브가 돌면서 발광하는 심이 카메라를 향하는 순간
 * 눈이 아플 정도로 번진다는 피드백을 받았다(디자인).
 *
 * `cube/`는 외부 반입이라 못 고치지만, `LOOK`은 index.ts가 "의도적으로 읽고 조정하라"고
 * export한 가변 객체다. 그래서 엔진을 건드리지 않고 여기서 덮어쓴다 — 다음 복사에도
 * 안 날아간다.
 *
 * 라이트 값 0.7은 `story/look.ts`의 원본 값이다. 원본이 나중에 바뀌면 이 상수가 계속
 * 이기므로, 조명이 이상해 보이면 여기부터 의심할 것.
 */
const DARK_BLOOM_GAIN = 0.55
const LIGHT_BLOOM_GAIN = 0.7

/*
 * 글로우가 시작되는 밝기. 다크에서만 올린다.
 *
 * 게인을 내려서 가만히 있을 때는 잡혔는데, **회전할 때만** 여전히 눈이 아프다는 피드백이
 * 남았다. 이건 게인으로 풀 문제가 아니다 — 게인은 볼륨이라 정적·회전을 같은 비율로
 * 줄이므로, 스파이크를 잡으려면 정적까지 흐리멍덩해질 때까지 내려야 한다. 그 끝은
 * 심이 안 빛나는 회색 돌덩이고, 그건 이 오브젝트의 정체성을 깎는 것이다(postfx 주석).
 *
 * 튀는 이유는 각도다. 큐브가 돌다가 발광하는 심이 카메라를 정면으로 향하는 순간 그
 * 픽셀들의 광도가 확 뛴다. 임계값을 올리면 어중간하게 밝은 면들은 아예 번지지 않고
 * 정말 밝은 심만 남아서, 가만히 있을 때는 거의 안 변하고 그 순간만 깎인다.
 *
 * 단위는 선형 광도이고 1.0이 흰색이다(look.ts). 원본 1.7 → 2.2.
 * 정적 상태가 너무 죽으면 임계값은 두고 DARK_BLOOM_GAIN을 0.6~0.65로 올릴 것.
 */
const DARK_BLOOM_THRESHOLD = 2.2
const LIGHT_BLOOM_THRESHOLD = 1.7

export default function CubeCanvas({ className = '' }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<CubeStage | null>(null)
  const isDark = useThemeAttr()
  // 스테이지 생성이 async라(셰이더를 미리 컴파일하고 resolve한다) 완료 시점의 테마가
  // 마운트 시점과 다를 수 있다. 최신값을 ref로 들고 가서 resolve 직후 한 번 맞춘다.
  const darkRef = useRef(isDark)
  darkRef.current = isDark

  /*
   * 데스크톱 브레이크포인트. BrandPanel의 `md:` 와 같은 768px이고, 같아야 한다 —
   * 레이아웃이 슬롯 모양을 바꾸는 지점과 우리가 구도를 고르는 지점이 어긋나면
   * 가로 슬롯에 세로 구도가 걸린다.
   *
   * 상태로 들고 있는 이유는 아래 이펙트의 deps에 넣기 위해서다. 마운트 때 한 번만
   * 읽으면 창을 브레이크포인트 너머로 줄였다 늘렸을 때 구도가 안 따라온다.
   */
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const read = () => setIsDesktop(mql.matches)
    read()
    mql.addEventListener('change', read)
    return () => mql.removeEventListener('change', read)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !isWebGL2Available()) return

    // ── 캔버스를 JSX가 아니라 여기서 만든다 ────────────────────────────────────────
    //
    // 이펙트가 도는 동안 캔버스가 매번 새것이어야 하기 때문이고, 이유는 구체적이다.
    // StrictMode는 이펙트를 두 번 돌린다. 생성이 async라서 실제로 나오는 순서는
    //
    //   ① 1회차 시작 → ② 1회차 정리(아직 promise 미완) → ③ 2회차 시작 → ④ 1회차 resolve
    //
    // 이고, ④에서 버려야 하는 스테이지가 `dispose()`를 부르면 그 안에서
    // `renderer.forceContextLoss()`가 돈다. 이건 **되돌릴 수 없다** — 그 캔버스
    // 엘리먼트는 다시는 WebGL 컨텍스트를 못 받는다. JSX로 캔버스를 하나 두면 ③과 ④가
    // 같은 엘리먼트를 보므로, 2회차 렌더러가 죽은 캔버스에 붙어서 아무것도 안 그린다.
    // (증상: 콘솔에 `THREE.WebGLRenderer: Context Lost.`, 화면엔 빈 캔버스.)
    //
    // forceContextLoss 자체는 엔진 쪽이 맞다 — GC를 기다리지 않고 GPU 컨텍스트를 즉시
    // 놓는 정석이다. 그러니 고칠 쪽은 여기고, 실행마다 새 엘리먼트를 주면 끝난다.
    //
    // 클래스가 아니라 인라인 스타일인 이유: Tailwind는 소스 텍스트를 스캔해서 유틸리티를
    // 만드는데, 여기서 만든 엘리먼트의 클래스가 그 스캔에 걸리는지에 레이아웃을 걸 이유가
    // 없다.
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    // 크기는 아래 ResizeObserver가 넣는다. 100%로 채우면 안 되는 이유는 그쪽 주석에.
    canvas.style.width = '0px'
    canvas.style.height = '0px'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', 'hello, world 프로젝트 큐브')
    host.appendChild(canvas)

    let cancelled = false
    let stage: CubeStage | null = null

    /*
     * 화면 밖으로 나가면 루프를 세운다.
     *
     * rAF는 **탭이 숨겨지면** 브라우저가 알아서 멈춰 주지만, 탭이 보이는 채로 캔버스만
     * 스크롤 밖으로 나간 경우는 안 멈춘다 — 모바일 로그인 화면이 정확히 그 경우다.
     * 큐브가 폼 아래에 있어서, 사용자가 이메일·비밀번호를 입력하는 내내 보이지도 않는
     * 27개 바디를 60fps로 계속 그린다. 폼 입력 중에 배터리를 태우는 셈이다.
     *
     * `stop()`은 rAF만 끊고 GL 리소스는 그대로 두므로, 다시 보이면 `start()`로 즉시
     * 이어진다. 엔진의 시계는 벽시계라 등장 연출은 이미 지나가 있고 쉬는 상태로 돌아온다.
     */
    /*
     * 캔버스를 칸에 꽉 채우지 않고, **비율을 지키면서 칸 안에 들어가는 최대 크기**로 맞춘다
     * (이미지의 object-fit: contain과 같은 계산).
     *
     * 이유는 엔진의 카메라가 세로 화각이라는 데 있다. 큐브의 픽셀 크기는 캔버스 **높이**에만
     * 비례하고(가로 0.93 x 높이), 캔버스 폭은 큐브 옆 여백만 정한다. 그런데 이 칸은
     * `md:flex-1`이라 높이가 화면을 따라 자라는 반면 폭은 카드의 max-w-[1240px]에 막혀
     * 689px에서 멈춘다. 그래서 화면이 높거나 창이 좁으면 큐브만 커져서 좌우가 잘렸다 —
     * 4K 전체화면에서 칸의 236%, 862x1000 창에서 135%였다.
     *
     * 비율을 고정하면 높이가 폭에 묶이므로 두 축이 같이 움직인다. 어떤 크기에서도 큐브는
     * 상자 폭의 62%를 쓰고, 상자는 칸을 넘지 않는다. 모바일은 원래 슬롯 비율이 460/560으로
     * 고정이라 계산 결과가 지금과 같다 — 값이 그대로 나오도록 같은 비율을 쓴다.
     *
     * CSS의 aspect-ratio로는 이걸 못 한다. min/max 클램프가 비율보다 우선이라 한 축이
     * 걸리는 순간 비율이 깨진다. 그래서 계산을 여기서 한다.
     */
    const boxAspect = isDesktop ? 3 / 2 : 460 / 560
    const fitCanvas = (hostWidth: number, hostHeight: number) => {
      const width = Math.max(1, Math.min(hostWidth, hostHeight * boxAspect))
      canvas.style.width = `${width}px`
      canvas.style.height = `${width / boxAspect}px`
    }
    const fitObserver = new ResizeObserver(([entry]) => {
      if (!entry) return
      fitCanvas(entry.contentRect.width, entry.contentRect.height)
    })
    fitObserver.observe(host)
    fitCanvas(host.clientWidth, host.clientHeight)

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) stageRef.current?.start()
        else stageRef.current?.stop()
      },
      { rootMargin: '120px' },
    )

    void createCubeStage({
      canvas,
      theme: darkRef.current ? 'dark' : 'light',
      // 카드가 자기 배경을 그린다. 큐브는 그 위에 합성만.
      backdrop: false,
      // 세로로 거의 균형. 큐브 위 0.92 / 아래 0.92 (1.0 = 프레임 가장자리).
      composition: [0, -0.016],
      portraitComposition: [0, -0.016],
      // 슬롯 폭은 레이아웃에서 최대로 잡아 줬고(BrandPanel의 md:-inset-x-14 + 카드
      // 분할비 1.45fr), 남은 배율을 여기서 채운다. dolly가 아니라 초점거리로 당기므로
      // 원근은 그대로다.
      //
      // 1.28이 이 슬롯의 한계다. 큐브가 회전하면서 화면을 제일 많이 먹는 순간은 대각선이
      // 카메라와 수직일 때고, 그 반지름이 1.65*sqrt(3)=2.86이다. 1.28에서 그 최악값이
      // 프레임의 92%를 쓴다 — 더 올리면 회전 중에 모서리가 잘린다. 여기서 더 키우려면
      // 배율이 아니라 **슬롯 자체가** 커져야 한다(세로 화각이라 캔버스를 픽셀로 키우면
      // 잘리는 것 없이 전부 비례해서 커진다).
      zoom: 1.28,
      // 접지 그림자를 좁히고 **카메라 반대쪽으로** 민다(offsetZ 음수).
      //
      // 원본은 5.6짜리 판을 카메라 쪽(+1.15)으로 당겨 놨는데, 얕은 부각에서 카메라에
      // 가까운 쪽일수록 화면 아래로 투영되므로 배율을 올리면 그 앞쪽이 제일 먼저 프레임을
      // 넘는다. 뒤로 밀면 투영이 위로 올라와서 그림자가 배율의 제약에서 빠진다.
      // height는 −2.95보다 올리면 안 된다 — 큐브가 돌 때 내려오는 게 반대각선 2.86이라
      // 판을 뚫고 검은 선이 생긴다.
      shadow: { spread: 3.2, offsetZ: -0.8, height: -2.95 },
      // 캔버스 밖 클릭은 폼과 버튼의 것이다.
      pointerSource: 'canvas',
      // 슬롯 비율로 구도를 자동 판정하지 않게 고정한다. 자동(0.85 경계)은 이 슬롯에서
      // 두 번 문제가 됐다 — 세로로 긴 칸을 폰으로 오인해 카메라를 1.44배 뒤로 뺐고,
      // 그 경계가 `flex-1` 높이 위에 있어서 창을 리사이즈하면 어느 픽셀에선가 피사체가
      // 44% 튀었다. 데스크톱 슬롯은 가로, 모바일 슬롯은 세로로 우리가 정한다.
      framing: isDesktop ? 'landscape' : 'portrait',
      // 자동 감지는 뷰포트가 작으면 mobile로 내린다. 큐브가 창보다 작은 지금은 그 판단
      // 근거가 성립하지 않으므로, 진짜 데스크톱일 때만 직접 정하고 나머지는 감지에 맡긴다
      // (폰에 desktop을 강제하면 안티앨리어싱과 DPR 2배가 일부러 제외해 둔 하드웨어에
      // 얹힌다 — 필레이트가 서너 배로 뛰고, 그게 중저가 폰에서 랙이 나는 조합이다).
      ...(window.matchMedia('(pointer: fine)').matches && window.innerWidth >= 768
        ? { tier: 'desktop' as const }
        : {}),
      // 단, 글로우만은 tier와 무관하게 항상 켠다.
      //
      // mobile tier가 제일 먼저 하는 일이 글로우 패스를 끄는 건데, 그러면 코어 발광도
      // 같이 낮춰져서(엔진이 맞춰 준다) 폰에서 심이 안 빛나는 **회색 돌덩이**가 나온다.
      // 나머지 tier 항목은 품질이라 깎아도 되지만 심은 이 오브젝트의 정체성이라 못 깎는다.
      // 폰은 캔버스가 작아서 블룸 피라미드도 작으므로, 이것만 켜는 게 데스크톱 tier를
      // 통째로 씌우는 것보다 훨씬 싸다.
      postfx: true,
    }).then((created) => {
      if (cancelled) {
        created.dispose()
        return
      }
      stage = created
      stageRef.current = created
      created.setTheme(darkRef.current ? 'dark' : 'light')
      created.start()
      observer.observe(host)
    })

    return () => {
      cancelled = true
      fitObserver.disconnect()
      observer.disconnect()
      stage?.dispose()
      stageRef.current = null
      canvas.remove()
    }
    // 브레이크포인트를 넘으면 구도가 바뀌므로 스테이지를 새로 만든다. 새 캔버스가
    // 만들어지고 옛 것은 정리되므로 위의 forceContextLoss 문제도 그대로 피해 간다.
  }, [isDesktop])

  useEffect(() => {
    // 엔진이 매 프레임 LOOK을 다시 읽으므로(stage.ts의 applyLook) 값만 바꿔 두면 다음
    // 프레임에 반영된다. 스테이지 생성이 아직 안 끝났어도 순서를 신경 쓸 필요가 없다.
    LOOK.bloomGain = isDark ? DARK_BLOOM_GAIN : LIGHT_BLOOM_GAIN
    LOOK.bloomThreshold = isDark
      ? DARK_BLOOM_THRESHOLD
      : LIGHT_BLOOM_THRESHOLD
    stageRef.current?.setTheme(isDark ? 'dark' : 'light')
  }, [isDark])

  return <div ref={hostRef} className={className} />
}

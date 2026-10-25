import { Suspense, lazy } from 'react'

/**
 * 큐브만 따로 내려받는다.
 *
 * `three`가 큐브 엔진을 통해 여기로 딸려 들어오는데, 정적 import면 그게 진입 청크에
 * 합쳐져서 **모든 라우트가** 받는다 — 로그인한 사용자가 피드로 바로 가도 한 번도 안 쓸
 * 500 kB를 받는다. 동적 import로 끊으면 `/login`을 실제로 그릴 때만 받는다.
 * (`features/profile`의 MeadowSection이 같은 이유로 이미 쪼개져 있다.)
 *
 * `BrandPanel`을 쓰는 화면은 로그인 하나뿐이라, 이 경계 하나로 끝난다.
 */
const CubeCanvas = lazy(() => import('./CubeCanvas'))

/**
 * 큐브가 앉는 칸. Suspense fallback도 같은 걸 써야 로딩 중 레이아웃이 안 흔들린다.
 *
 * `flex items-center justify-center`가 붙은 건 캔버스가 이제 이 칸을 꽉 채우지 않기
 * 때문이다. CubeCanvas가 칸 안에서 비율을 지키는 크기를 계산해 캔버스에 직접 넣고,
 * 남는 자리는 여기서 가운데로 모은다. 자세한 이유는 CubeCanvas의 주석 참고.
 */
const CUBE_SLOT =
  'relative mx-auto mt-5 flex aspect-[460/560] w-full max-w-[320px] flex-none items-center justify-center md:-mx-14 md:-mb-10 md:mt-4 md:aspect-auto md:w-auto md:min-h-0 md:max-w-none md:flex-1'

/**
 * 인증 화면 좌측 브랜드 패널 (시안 Login.dc.html 좌측 컬럼).
 * 로고 + 헤드라인 + 프로젝트 큐브.
 * 색은 전부 index.css의 토큰(var(--color-*))을 쓴다 — 리터럴 색 금지.
 */

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
      <circle cx="12" cy="12" r="1.7" fill="var(--color-brand)" stroke="none" />
    </svg>
  )
}

function BrandPanel() {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-ink">
          <BrandMark size={32} />
        </span>
        <div>
          <div className="text-ink text-[21px] leading-none font-bold">hello, world</div>
          <div className="text-ink-subtle mt-1 text-[11px] tracking-[0.14em]">
            개발자 프로젝트 커뮤니티
          </div>
        </div>
      </div>

      <h1 className="text-ink mt-6 mb-3 text-3xl leading-[1.3] font-bold tracking-[-0.02em] break-keep lg:mt-8 lg:text-[41px]">
        다시 만나 반가워요.
        <br />
        함께 <span className="text-brand">만들어가요.</span>
      </h1>
      <p className="text-ink-muted m-0 text-[15px] leading-[1.85] break-keep">
        개발자와 연결하고, 아이디어를 나누며,
        <br />
        완성한 프로젝트를 다시 세상에 소개하세요.
      </p>

      {/*
        프로젝트 큐브 — 시안의 정적 SVG 일러스트를 실제 3D 오브젝트로 교체.

        **흐름 안에 둔다.** 한 번 카피 뒤로 절대 배치해 봤는데, 그게 화면 높이를 전혀 안
        봐서 실패했다: `aspect-square`라 높이가 폭을 따라가는데(1920에서 733px) 패널은
        뷰포트를 따라가므로(1440×780에서 716px) 캔버스가 패널보다 커지고, 큐브가 본문
        위에 그대로 얹혀서 글자를 덮었다. `flex-1`은 카피가 쓰고 남은 만큼만 가져가므로
        정의상 겹칠 수가 없고, 화면이 낮아지면 큐브도 같이 작아진다.

        `md:-mx-14`로 칼럼 좌우 패딩을 되돌려 폭은 칼럼 전체를 쓰고, `md:-mb-10`으로 아래
        패딩까지 잠식한다 — 둘 다 큐브 주변 여백일 뿐이라 내줄 이유가 없다.

        모바일은 원래 SVG의 viewBox 비율(460:560)을 aspect로 준다 — 캔버스는 SVG와 달리
        고유 비율이 없어서 높이를 안 주면 `h-full`이 0으로 떨어진다.

        엘리먼트는 **하나**다. 모바일/데스크톱을 각각 두면 WebGL 컨텍스트가 두 개 생기고,
        그중 하나는 `display:none`인 0크기 캔버스에 계속 그린다.
      */}
      {/*
        fallback은 **같은 클래스의 빈 div**다. 청크를 받는 동안 자리를 그대로 잡고 있어야
        카피가 아래로 내려왔다 다시 올라가는 일이 없다. 큐브는 어차피 등장 연출이 2.2초라
        몇백 ms 늦게 채워지는 건 눈에 띄지 않는다.
      */}
      <Suspense fallback={<div className={CUBE_SLOT} />}>
        <CubeCanvas className={CUBE_SLOT} />
      </Suspense>
    </>
  )
}

export default BrandPanel

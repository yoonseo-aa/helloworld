# 큐브 — 반출 키트

로그인 화면의 큐브 전체가 이 폴더 하나에 들어 있다. **폴더를 통째로 복사하고 `three`를
설치하면 끝난다.** 에셋도, 로더도, 빌드 플러그인도 없다.

```ts
import { createCubeStage, isWebGL2Available } from './cube';

if (isWebGL2Available()) {
  const stage = await createCubeStage({ canvas });
  stage.start();
}
```

---

## 왜 복사만으로 되는가

세 가지가 성립하도록 만들어 뒀고, 셋 다 대가를 치른 결과다.

- **바이너리 에셋이 0개다.** 돌 표면, 먼지 스프라이트, 접지 그림자는 시작할 때 캔버스에
  그려서 만들고(`objects/textures.ts`), 환경광 프로브는 메모리에서 생성해 PMREM을 돌린다
  (`scene/environment.ts`). `public/`에 넣을 것도, 로딩 순서를 맞출 것도 없다.
- **프레임워크 의존이 없다.** React를 import하는 파일이 하나도 없고, 넘겨받은 캔버스
  말고는 document를 건드리지 않는다.
- **페이지에 대한 전제가 없다.** 자기 캔버스를 스스로 측정하고, 테마는 이름으로 받고,
  자기가 그리지 않은 배경 위에 합성할 수 있고, 캔버스 밖 제스처를 무시하게 만들 수 있다.

의존성은 `three` 하나뿐이다. 이 저장소가 고정한 버전:

| 패키지 | 버전 |
| --- | --- |
| `three` | 0.185.1 |
| `@types/three` | 0.185.4 |

`three/examples/jsm`에서 `RoundedBoxGeometry`와 `BufferGeometryUtils`를 쓴다 — 둘 다
`three` 패키지에 들어 있으므로 추가 설치는 없다.

---

## API

```ts
const stage = await createCubeStage(options);
```

`createCubeStage`는 **async**다. 셰이더를 미리 컴파일하고 나서 resolve하기 때문이고
(`compileAsync`), 그래서 첫 프레임이 27개 바디의 프로그램 컴파일로 멈추지 않는다.
호스트는 이 promise가 풀릴 때까지 로딩 상태를 잡고 있으면 된다.

### 옵션

| 옵션 | 기본값 | 뜻 |
| --- | --- | --- |
| `canvas` | (필수) | 그릴 캔버스. 레이아웃은 CSS가 갖는다 — 렌더러는 CSS를 쓰지 않는다. |
| `theme` | `'dark'` | `'dark'` \| `'light'`. 나중에 `stage.setTheme(name)`. |
| `backdrop` | `true` | 큐브가 자기 배경 그라디언트를 그릴지. `false`면 캔버스에 알파가 생기고 뒤에 있는 것 위에 합성된다. |
| `composition` | `[0.26, 0.035]` | 피사체 위치(뷰포트 비율). +x는 왼쪽으로, +y는 아래로. 기본값은 오른쪽 로그인 칼럼을 비우려고 왼쪽으로 민 값이다. |
| `portraitComposition` | `[0, -0.27]` | 세로 화면(0.85:1보다 좁을 때)용. 이때 카메라는 뒤로도 빠진다. |
| `zoom` | `1` | 피사체를 몇 배로 그릴지. **dolly가 아니라 초점거리**라 원근은 그대로다. 아래 "크게 만들기" 참고. |
| `framing` | `'auto'` | `'landscape'` \| `'portrait'`로 고정. `'auto'`는 비율 0.85에서 갈리는데, 그게 **절벽**이라 리사이즈 중에 피사체가 44% 튄다. 슬롯 모양을 아는 호스트는 직접 정하는 게 맞다. |
| `shadow` | (LOOK 값) | 접지 그림자의 `spread` / `height` / `offsetZ`. 좁은 슬롯에서 그림자가 잘릴 때 줄인다. `height`는 −2.95보다 올리면 안 된다. |
| `pointerSource` | `'window'` | `'window'`는 폼 컨트롤이 아닌 곳 어디를 눌러도 큐브를 잡는다. **임베드할 때는 `'canvas'`** — 앱의 다른 클릭을 먹으면 안 된다. |
| `tier` | (자동 감지) | `'desktop'` \| `'mobile'`. 아래 함정 항목을 볼 것. |
| `postfx` | (tier 따름) | 글로우 패스만 tier와 무관하게 켜고 끈다. **폰에서 심을 빛나게 하려면 이것**. 비용은 아래. |
| `onProgress` | — | 0→1. 로딩 표시용. |
| `onThemeApplied` | — | 테마 적용 직후. 룩 오버라이드를 다시 얹을 때만 필요하다. |
| `debug` | `false` | `window.__charge` / `__heat`를 노출한다. |

### 핸들

```ts
stage.setTheme('light');
stage.start();
stage.stop();     // 루프만 멈춘다. start()로 재개.
stage.resize();   // 보통 필요 없다 — ResizeObserver가 알아서 한다.
stage.dispose();  // GL 리소스·리스너·타이머 전부 해제.
stage.stats;      // fps, drawCalls, triangles, tier …
```

---

## 이 앱에 어떻게 붙어 있나

**아래 1~4번은 이미 적용돼 있습니다.** 다시 할 일이 아니라, 어디를 보고 무엇을 건드리면
되는지에 대한 기록입니다. 5번(호스트 최적화)은 유지해야 할 규칙입니다.

### 1. three 설치 — 완료

`package.json`에 들어 있으므로 `npm install`이면 같이 깔린다. 처음부터 다시 세팅할 때만:

```bash
npm i three@0.185.1 && npm i -D @types/three@0.185.4
```

### 2. 폴더 위치 — 완료

이 저장소에서는 이미 `src/features/auth/cube/`에 들어와 있다. 원본은 디자인 쪽에서 관리하는
별도 저장소에 있고, 엔진을 바꿔야 하면 거기서 조정한 뒤 이 폴더를 통째로 교체한다.

`components/`나 `lib/`이 아니라 feature 안인 이유는 그쪽 `CLAUDE.md`다 — "components/
승격은 두 번째 사용처가 생겼을 때"이고, 캔버스 엔진 선례가 `features/profile/meadow/`다.
쓰는 도메인 옆에 둔다. `../debug/tuningPanel.ts`는 안 가져가도 된다(패널은 애초에 이
폴더 밖에 있다).

### 3. 래퍼 컴포넌트 — 완료

`frontend/src/features/auth/components/CubeCanvas.tsx`. 이 앱에 이미 있는
`useThemeAttr()`을 구독한다 — `html[data-theme]`을 단일 진실로 두는 그 훅으로, 초원
캔버스가 같은 이유로 이미 쓰고 있다.

실제로 붙어서 도는 파일이 거기 있으니 전문은 그걸 보고, 여기서는 **반드시 이래야 하는
부분**만 적는다.

```tsx
useEffect(() => {
  const host = hostRef.current
  if (!host || !isWebGL2Available()) return

  // 캔버스는 JSX가 아니라 이펙트 안에서 만든다. 이유는 아래 "StrictMode" 함정 참고 —
  // 이걸 JSX `<canvas ref={...}>`로 두면 개발 모드에서 큐브가 아예 안 나온다.
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  host.appendChild(canvas)

  let cancelled = false
  let stage: CubeStage | null = null

  void createCubeStage({ canvas, theme: darkRef.current ? 'dark' : 'light', /* … */ })
    .then((created) => {
      if (cancelled) {
        created.dispose()
        return
      }
      stage = created
      created.setTheme(darkRef.current ? 'dark' : 'light')
      created.start()
    })

  return () => {
    cancelled = true
    stage?.dispose()
    canvas.remove()
  }
}, [])
```

### 4. LoginPage에 꽂기 — 완료

`BrandPanel`이 쓴다. 엘리먼트는 **하나**고 반응형 클래스로만 갈린다 — 모바일/데스크톱을
각각 두면 WebGL 컨텍스트가 두 개 생기고 그중 하나는 `display:none`인 0크기 캔버스에 계속
그린다.

```tsx
const CubeCanvas = lazy(() => import('./CubeCanvas'))

// fallback과 같은 클래스를 써야 청크를 받는 동안 레이아웃이 안 흔들린다.
const CUBE_SLOT =
  'relative mx-auto mt-5 aspect-[460/560] w-full max-w-[320px] flex-none md:-mx-14 md:-mb-10 md:mt-4 md:aspect-auto md:w-auto md:min-h-0 md:max-w-none md:flex-1'

<Suspense fallback={<div className={CUBE_SLOT} />}>
  <CubeCanvas className={CUBE_SLOT} />
</Suspense>
```

- **흐름 안에 둔다(`md:flex-1`).** 한 번 카피 뒤로 절대 배치해 봤는데 실패했다:
  `aspect-square`는 높이가 폭을 따라가는데(1920에서 733px) 패널 높이는 뷰포트를 따라가므로
  (1440×780에서 716px) 캔버스가 패널보다 커지고, 큐브가 본문 위에 얹혀서 글자를 덮었다.
  `flex-1`은 카피가 쓰고 남은 만큼만 가져가므로 정의상 겹칠 수 없고, 화면이 낮아지면
  큐브도 같이 작아진다.
- 캔버스는 `h-full`이라 **부모가 높이를 주지 않으면 0이다.** 모바일에서 `aspect-*`로
  잡아 주는 이유가 그것이다(캔버스는 SVG와 달리 고유 비율이 없다).
- `md:-mx-14` / `md:-mb-10`은 칼럼의 좌우·아래 패딩을 되돌린다. 둘 다 큐브 주변 여백일
  뿐이라 내줄 이유가 없다.

### 5. 호스트가 지켜야 할 최적화 두 가지 (계속 유효)

엔진이 대신 해 줄 수 없는 것들이라 적어 둔다.

**동적 import로 끊는다.** `three`가 이 폴더를 통해 딸려 들어오는데, 정적 import면 진입
청크에 합쳐져서 **모든 라우트가** 받는다. 실측: 진입 청크 1,372 kB(gzip 390) →
789 kB(gzip 236), 큐브는 584 kB(gzip 153)짜리 별도 청크로 빠졌다.

```tsx
const CubeCanvas = lazy(() => import('./CubeCanvas'))
// fallback은 같은 클래스의 빈 div — 청크 받는 동안 레이아웃이 흔들리면 안 된다.
<Suspense fallback={<div className={CUBE_SLOT} />}><CubeCanvas className={CUBE_SLOT} /></Suspense>
```

**화면 밖으로 나가면 `stop()`한다.** rAF는 *탭이 숨겨지면* 브라우저가 멈춰 주지만, 탭이
보이는 채로 캔버스만 스크롤 밖으로 나간 경우는 안 멈춘다. 모바일 로그인 화면이 정확히 그
경우다 — 큐브가 폼 아래에 있어서, 사용자가 입력하는 내내 보이지도 않는 27개 바디를 계속
그린다. `IntersectionObserver`로 `stop()`/`start()`를 물리면 된다. `stop()`은 rAF만 끊고
GL 리소스는 그대로 두므로 재개가 즉시고, 엔진 시계는 벽시계라 등장 연출은 이미 지나간
쉬는 상태로 돌아온다.

---

## 함정 — 실제로 밟은 것들

### StrictMode + async 생성 = 죽은 캔버스 (제일 먼저 밟았다)

증상은 **큐브가 아예 안 나온다**. 콘솔에 `THREE.WebGLRenderer: Context Lost.` 하나가
찍히고, 캔버스는 크기도 맞고 DOM에도 있는데 비어 있다.

순서가 이렇게 된다.

1. StrictMode가 이펙트를 두 번 돌린다.
2. `createCubeStage`는 **async**다(셰이더를 미리 컴파일하고 resolve한다). 그래서 1회차
   promise가 풀리기 **전에** 1회차 정리가 먼저 돈다.
3. 2회차가 같은 캔버스로 새 스테이지를 만든다.
4. 그제서야 1회차 promise가 풀리고, 버려야 하니까 `dispose()`를 부른다. 그 안에서
   `renderer.forceContextLoss()`가 돈다.

`forceContextLoss()`는 **되돌릴 수 없다**. 그 캔버스 엘리먼트는 다시는 WebGL 컨텍스트를
못 받는다. 그래서 3번에서 만든 멀쩡한 스테이지가 죽은 캔버스 위에서 돌게 된다.

`forceContextLoss` 자체는 엔진 쪽이 맞다 — GC를 기다리지 않고 GPU 컨텍스트를 즉시 놓는
정석이고, 안 하면 라우트를 몇 번 오가는 것만으로 컨텍스트가 쌓인다(브라우저당 동시
WebGL 컨텍스트는 대략 16개가 상한이다). 고칠 쪽은 래퍼고, **실행마다 새 캔버스
엘리먼트를 주면** 끝난다. 위 코드가 `document.createElement('canvas')`를 쓰는 이유가
이것 하나다.

### 크게 만들기 — `zoom`을 올리기 전에 슬롯 비율부터 본다

큐브가 작아 보이면 십중팔구 `zoom`이 문제가 아니라 **슬롯 비율**이다.

가로:세로가 **0.85보다 좁으면** 엔진이 세로 구도로 판정하고 카메라를 **1.44배 뒤로 뺀다**
(`cameraRig.ts`의 `isPortrait`). 좁은 폰 화면에서 큐브 실루엣을 다 담으려고 있는 동작인데,
데스크톱 카드 안의 세로로 긴 슬롯도 똑같이 걸린다. 로그인 화면이 정확히 이 경우였다 —
525×637이라 비율 0.82, 그래서 1.44배 뒤로 물러난 그림이 나오고 있었다. 슬롯을 637×637로
바꾼 것만으로 **1.6배**가 커졌다. `zoom`은 손도 안 댔다.

두 번째로 알아둘 것: `camera.fov`는 **세로** 화각이다. 즉 캔버스를 픽셀로 크게 만들면
NDC 범위는 그대로인 채 전부 비례해서 커진다 — **새로 잘리는 게 생기지 않는다.** 반대로
`zoom`을 올리면 NDC 범위 자체가 커지므로 프레임 밖으로 나가기 시작한다. 그래서 순서는
① 슬롯 비율을 0.85 이상으로(또는 `framing`으로 고정), ② 슬롯을 픽셀로 크게, ③ 그래도
모자라면 `zoom`이다.

`zoom`의 한계는 **1.28**이다. 큐브가 회전하면서 화면을 제일 많이 먹는 순간은 대각선이
카메라와 수직일 때고 그 반지름이 `1.65 * sqrt(3) = 2.86`인데, 1.28에서 그 최악값이
프레임의 92%를 쓴다. 더 올리면 회전 중에 모서리가 잘린다.

그리고 ②에서 실제로 걸리는 건 **폭**이다. 큐브 실루엣은 돌면 거의 정사각이라 슬롯 폭이
곧 상한이고, 높이만 늘리면 가로로 잘린다. 로그인 화면에서 큐브를 키울 때 `zoom`은
1.15→1.28(+11%)밖에 못 올렸고, 나머지는 전부 슬롯을 넓혀서 얻었다(카드 분할비
1.06fr→1.25fr, 1920에서 칼럼 637px→688px).

여기에 함정이 하나 더 있다. 폭만 보고 높이를 고정 비율로 잡으면(`aspect-square`) 뷰포트가
낮을 때 캔버스가 패널보다 커진다. 최종적으로는 폭만 레이아웃에서 최대로 잡고 높이는
`flex-1`에 맡겼다 — 4번 항목 참고.

### 그림자가 프레임을 넘어가면 바닥에 줄이 생긴다

접지 그림자는 큐브(한 변 3.3)보다 큰 5.6짜리 판이고, 월드 y **−3.15**에 있다. 큐브 밑면은
−1.65인데 왜 그렇게 내려가 있냐면, 큐브가 돌 때 실제로 내려오는 건 반대각선 2.86이라서
판이 더 높으면 모서리가 판을 뚫고 지나가기 때문이다(어두운 반투명 판이 솔리드를 관통하면
검은 직선이 그어진다 — `story/look.ts`의 `shadowHeight` 주석).

그 결과 **큐브+그림자 구도는 큐브보다 훨씬 세로로 길다.** 좁은 슬롯에서 제일 먼저 프레임을
넘어가는 게 그림자 앞쪽이고, 부드러운 그라디언트가 직선 경계로 잘리니까 바닥에 줄이 그어진
것처럼 보인다. **프레임을 넓혀도 소용없다** — 그림자도 같이 커진다.

고치는 법은 세 개고, 세 번째가 제일 효과가 크다.

1. `shadow.spread`로 판을 좁힌다. 접지가 목적이라 가까이 붙은 작은 판이 오히려 낫다.
2. `composition`의 y를 음수로 줘서 구도 전체를 올린다. 큐브만 가운데 맞추면 안 되고,
   큐브 위쪽과 그림자 아래쪽이 **같이** 안에 들어와야 한다.
3. **`shadow.offsetZ`를 음수로 줘서 판을 카메라 반대쪽으로 민다.** 부각이 얕아서 카메라에
   가까운 쪽일수록 화면 아래로 투영되므로, 뒤로 밀면 투영이 위로 올라온다. 이것만으로
   그림자가 배율의 제약에서 빠지고, 그 다음부터는 큐브 자신이 한계가 된다.

**`shadow.height`는 −2.95보다 올리지 말 것** — 위의 관통이 다시 시작된다. 판을 올려서
공간을 벌고 싶은 유혹이 있는데, 벌 수 있는 게 0.2 단위뿐인 데다 대가가 검은 선이다.

로그인 화면에서 실제로 쓴 값: `zoom: 1.28`, `composition: [0, -0.016]`,
`shadow: { spread: 3.2, offsetZ: -0.8, height: -2.95 }`. 이때 큐브 위/아래가 각각 0.92,
그림자 아래가 0.86이다(1.0 = 프레임 가장자리).

### tier 자동 감지는 뷰포트를 본다

`detectDeviceTier()`는 `min(innerWidth, innerHeight) < 700`이면 mobile로 내린다. 큐브가
곧 페이지였을 때는 맞는 판단이었다. 임베드하면 아니다 — **1000×620 노트북 창에 420px
큐브를 넣으면 mobile로 떨어지고, mobile tier가 제일 먼저 하는 일이 글로우 패스를 끄는
것이다.** 심을 빛나게 하는 그게 사라진다. 기기가 못 해서가 아니라 창이 작아서.

그래서 `tier: 'desktop'`을 명시하는 걸 권한다. 단, 이건 품질 슬라이더가 아니라 실제
비용이다 — 폰에서 `'desktop'`을 강제하면 안티앨리어싱, DPR 2배, 5단 블룸 피라미드가
일부러 제외해 둔 하드웨어에 얹힌다. 화면 크기로 갈라 쓰는 편이 낫다.

### 폰에서 심을 빛나게 하려면 `postfx`만 켠다

tier는 묶음이라 DPR 상한·안티앨리어싱·먼지 수·글로우가 같이 움직이는데, 그 묶음이 딱
하나에 대해 틀렸다. 앞의 셋은 **품질**이라 깎아도 화질이 조금 손해일 뿐이지만, 글로우는
품질이 아니다 — 심이 이 오브젝트의 정체성이고, 패스가 없으면 코어 발광도 거기 맞춰
낮춰지므로(`createCoreMaterial`의 `tier.postfx` 인자) 폰에는 **회색 돌덩이**가 나온다.

`postfx: true`만 주면 나머지는 mobile로 둔 채 글로우만 살아난다. 다만 공짜는 아니다 —
320×390 캔버스, mobile tier에서 실측:

| | draw call | 삼각형 | 프로그램 | 텍스처 |
| --- | --- | --- | --- | --- |
| `postfx: false` | 56 | 103,358 | 7 | 6 |
| `postfx: true` | 123 | 206,738 | 13 | 18 |

**대략 두 배다.** 피라미드가 커서가 아니라 프리패스가 씬을 한 번 더 그리기 때문이다.
다만 두 배가 된 기준값 자체가 작아서(삼각형 20만, 캔버스 560×683 실픽셀) 요즘 폰이면
60fps에 여유가 있다. `tier: 'desktop'`을 통째로 씌우면 여기에 DPR 2배가 곱해져 **모든**
패스의 필레이트가 다시 뛰므로, 글로우만 켜는 쪽이 확실히 싸다.

수치는 전부 headless swiftshader 측정이라 **실기기 프레임은 재보지 않았다.** 저사양
기기가 걱정되면 `navigator.hardwareConcurrency`로 한 번 더 갈라도 된다.

### backdrop을 끄면 배경은 호스트 것이다

`backdrop: false`면 큐브는 알파를 가진 채 합성만 한다. 비네트도 같이 없어진다 — 그건
이 저장소 `app.css`의 `#app::after`에 있고, 반출 대상이 아니다. 어두운 배경 위에 얹을
거라면 그 그라디언트를 호스트 CSS로 다시 만들어 주는 게 낫다. 심의 빛이 화면에서 제일
밝은 것으로 읽히는 건 그 falloff이 하던 일이다.

### composition은 이 페이지의 사정이다

기본 `[0.26, 0.035]`는 오른쪽에 로그인 칼럼이 있는 레이아웃 때문에 큐브를 왼쪽으로 민
값이다. 가운데 정렬된 카드나 정사각 패널에 넣으면 같은 값이 큐브를 가장자리로 밀어붙인다.
슬롯 모양에 맞춰 정하면 된다.

### 첫 프레임과 레이아웃

스테이지는 생성 시점에 캔버스를 측정한다. React의 `useEffect`는 커밋·레이아웃 뒤에
돌기 때문에 정상 경로에서는 이미 정확한 값이 나온다. 아직 박스가 없으면 뷰포트로
대신 잡고, `ResizeObserver`가 다음 렌더링 스텝에 진짜 값을 준다.

---

## 같이 오지 않는 것

의도적으로 두고 왔다.

- **로그인 폼** — `src/ui/login.ts`는 데모다. 네트워크도, 저장도 없고 비밀번호 필드는
  아예 읽지 않는다. 대상 앱에는 진짜 `LoginForm.tsx`가 이미 있다.
- **비네트** — `app.css`의 `#app::after`. 위 함정 항목 참고.
- **UI 토큰과 빌드 플러그인** — `src/theme/tokens.ts`와 `vite.config.ts`의 주입기는
  이 페이지의 CSS 변수용이다. 큐브가 읽는 색은 전부 `src/cube/theme.ts`에 따로 있다.
- **룩 개발 패널** — `src/debug/tuningPanel.ts`. lil-gui를 끌어오고 `window`에 쓴다.
  큐브는 `LOOK`과 하늘 설정을 export하므로, 패널을 붙이는 건 호스트가 정할 일이다.

## 만지면 안 되는 것

`story/look.ts`와 `story/state.ts`의 값은 오래 조정한 결과이고, 각 숫자 위에 왜 그
값인지가 적혀 있다. 특히:

- `LOOK`의 조명 3점 — 진열장 조명이다. 키를 카메라 뒤로 보내면 큐브 앞면이 회전 중
  일정 구간 동안 새까매진다. 두 번 겪은 실패고 주석에 남아 있다.
- `bloomThreshold: 1.7` — half-float 체인의 **선형 광도** 단위다. 1.0이 흰색이고 심은
  5 위에 있다. 8비트 시절 값(0.72 같은)을 넣으면 안개가 된다.
- `ENTRANCE` 타이밍 — 로그인 화면이라 2.2초 안에 끝난다. 이메일 칸에 손이 가는 시간보다
  길면 방해가 된다.

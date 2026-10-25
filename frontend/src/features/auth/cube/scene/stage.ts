import * as THREE from 'three';
import { createRenderer } from './renderer';
import { createBackdrop, createEnvironment, type Environment } from './environment';
import { createCameraRig } from './cameraRig';
import { BLOOM_LAYER, NO_BLOOM_LAYER, createBloomPass } from './postfx';
import { createHeroRelic, type HeroRelic } from '../objects/heroRelic';
import { createTextureSet, disposeTextureSet } from '../objects/textures';
import { createSubjectState, evaluateSubject, type SubjectState } from '../story/state';
import { LOOK } from '../story/look';
import { RIG_DEFAULTS } from './lighting';
import { STONE_AO_DEFAULTS } from '../objects/relicCube';
import { SHADOW_DEFAULTS } from '../objects/contactShadow';
import { Disposer, disposeObject } from '../lib/dispose';
import { clamp01, damp } from '../lib/math';
import { debug } from '../lib/debug';
import {
  detectDeviceTier,
  hasFinePointer,
  prefersReducedMotion,
  tierFor,
  type DeviceTier,
  type TierName,
} from '../lib/deviceTier';
import { applyCubeTheme, resolveCubeTheme, type CubeThemeName } from '../theme';

/**
 * 큐브의 WebGL 쪽을 소유한다: 렌더러, 씬 하나, 카메라 하나, 주인공 오브젝트, 렌더 루프.
 *
 * 예전엔 페이지의 더 많은 부분을 소유했다. 크기를 `window.innerWidth`와
 * `window.innerHeight`에서 가져왔고, 제스처를 `window`에서 읽어서 이벤트가 인터랙티브
 * 요소에 떨어졌는지 물어보는 방식으로 걸렀으며, 테마는 호스트가 만들어 줘야 하는 해결된
 * 토큰 레코드로 도착했고, 룩 개발 패널을 `import.meta.env.DEV` 뒤에서 여기 안에서
 * import했다. 그 하나하나가 "스테이지가 곧 페이지"라는 전제였고, 각각이 이 모듈을 다른
 * 곳에 가져다 놓을 수 없게 만드는 이유였다 — 지금은 그게 이 모듈이 반드시 가져야 하는
 * 성질이다.
 *
 * 그래서 지금은: 넘겨받은 캔버스를 스스로 측정하고, 뒤에 있는 것 위에 합성하라고 지시할 수
 * 있고, 테마를 이름으로 받고, 패널은 호스트의 몫이다. 바뀌지 않은 것은 **눈에 보이는
 * 모든 것**이다. 구도, 조명 리그, 재질, 등장, 모든 제스처가 예전 그대로의 숫자다.
 */

export interface StageStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  fps: number;
  cubeletCount: number;
  tier: string;
}

export interface CubeStage {
  readonly stats: StageStats;
  readonly state: SubjectState;
  /** 씬 그래프 루트. 진단용, 그리고 호스트가 룩 개발 패널을 돌릴 때 쓴다. */
  readonly root: THREE.Scene;
  /**
   * 카메라. 씬에 부모로 붙이지 않는데 — 그럴 필요가 있는 게 없다 — 그래서 `root`를 훑는
   * 테스트 하네스는 달리 이걸 찾을 방법이 없고, 이게 없으면 격자 좌표를 테스트가 클릭해야
   * 할 화면 픽셀로 바꿀 방법이 없다.
   */
  readonly camera: THREE.PerspectiveCamera;
  /** 하늘 프로브. 룩 개발 패널이 다시 만들 수 있도록 노출한다. */
  readonly environment: Environment;
  setTheme(theme: CubeThemeName): void;
  start(): void;
  /** 아무것도 해제하지 않고 루프만 멈춘다. `start()`로 재개된다. */
  stop(): void;
  resize(): void;
  dispose(): void;
}

export interface CubeStageOptions {
  readonly canvas: HTMLCanvasElement;
  /** 기본값은 `'dark'`. */
  readonly theme?: CubeThemeName;
  /**
   * 큐브가 자기 배경 그라디언트를 그릴지 여부.
   *
   * true가 원래 잡아 둔 구도다 — 페이지 배경을 렌더러가 칠하고, 그래서 감쇠가 어떤
   * 초점거리에서도 피사체 정확히 뒤에 앉는다. false면 캔버스에 알파 채널이 생기고 호스트가
   * 뒤에 둔 것 위에 큐브를 합성한다. 기존 레이아웃 안의 카드나 패널이 원하는 쪽이다.
   */
  readonly backdrop?: boolean;
  /**
   * 구도 이동(뷰포트 비율). +x는 피사체를 왼쪽으로, +y는 아래로.
   * 기본값은 원래 잡아 둔 프레이밍이고, 로그인 칼럼을 비우려고 큐브를 왼쪽으로 민 값이다.
   */
  readonly composition?: readonly [number, number];
  readonly portraitComposition?: readonly [number, number];
  /**
   * 피사체를 몇 배 크게 그릴지. 1이 원래 프레이밍, 2면 두 배.
   * 초점거리로 적용하므로 원근은 그대로다 — `CameraRigOptions.zoom` 참고.
   */
  readonly zoom?: number;
  /**
   * 캔버스 비율로 판정하는 대신 두 구도 중 어느 쪽을 쓸지 고정한다.
   *
   * `'auto'`가 원래 동작이다. 0.85:1보다 좁으면 리그가 1.44배 뒤로 물러나면서 화각을
   * 넓혀서, 좁은 폰에서도 실루엣 전체가 담긴다. 그런데 그 규칙은 **캔버스**를 읽는다.
   * 큐브가 곧 페이지이던 시절에는 그게 기기와 같은 말이었지만 지금은 아니다 — 넓은 데스크톱
   * 카드 안의 세로로 긴 칸이 그 조건에 걸리고, 큐브가 조용히 절반 크기로 렌더된다.
   *
   * 한 번 틀리는 것보다 나쁜 건 그게 **절벽**이라는 점이다. 높이가 `flex-1`에서 나오는
   * 칸은 창을 리사이즈하는 동안 0.85를 넘나들고, 높이 1픽셀 차이로 피사체가 44% 튄다.
   * 자기 칸의 모양을 아는 호스트는 그걸 말해 줘야 한다.
   */
  readonly framing?: 'auto' | 'landscape' | 'portrait';
  /**
   * 접지 그림자의 크기. 원래 값이 프레임에 안 맞을 때 쓴다.
   *
   * 이게 큐브를 얼마나 크게 그릴 수 있는지를 결정하는데, 재보기 전에는 잘 드러나지 않는다.
   * 그림자 판은 큐브의 3.3에 대해 5.6짜리이고 y −3.15에 앉는다 — 큐브 자신의 밑면 −1.65보다
   * 한참 아래인데, 큐브가 돌 때 실제로 내려오는 것이 반대각선 2.86이라 판이 조금이라도
   * 높으면 모서리에 찔리기 때문이다. (어두운 반투명 사각형이 솔리드 지오메트리를 관통하면
   * 그 위로 검은 직선이 그어진다. `story/look.ts`의 `shadowHeight` 주석 참고.)
   *
   * 그 결과 큐브+그림자 구도는 큐브보다 훨씬 세로로 길고, 좁은 칸에서는 그림자의 앞쪽
   * 가장자리가 제일 먼저 프레임을 벗어난다 — 부드러운 그라디언트가 딱딱한 경계에 잘리므로
   * 바닥을 따라 직선으로 번진 자국처럼 읽힌다. 프레임을 넓혀도 소용없다. 그림자도 같이
   * 커지기 때문이다.
   *
   * 그래서 칸이 작은 호스트는 판을 당겨 올 수 있다. 목적은 접지이고, 가까이 붙은 작은 판이
   * 그 일을 최소한 그만큼은 해낸다. **`height`는 대략 −2.95보다 아래에 있어야 한다.**
   * 아니면 모서리가 다시 관통하기 시작한다.
   */
  readonly shadow?: {
    /** 지름(월드 유닛). 원래 값 5.6. 큐브 자신의 한 변은 3.3이다. */
    readonly spread?: number;
    /** 판의 높이. 원래 값 −3.15. 대략 −2.95 위로는 올리지 말 것. */
    readonly height?: number;
    /** 판이 카메라 쪽으로 얼마나 나와 있는지. 원래 값 1.15. 낮출수록 앞 가장자리가 올라온다. */
    readonly offsetZ?: number;
  };
  /**
   * 제스처가 시작될 수 있는 곳.
   *
   * `'window'`가 원래 동작이다. 폼 컨트롤이 아닌 곳 어디를 눌러도 큐브를 붙잡는데, 큐브와
   * 카피 말고는 아무것도 없는 페이지에는 그게 맞다. `'canvas'`는 시작을 캔버스 자체로
   * 제한한다. 임베드된 인스턴스가 원하는 쪽이다 — 주변 애플리케이션으로 향한 클릭을
   * 먹으면 안 된다. 이미 진행 중인 제스처는 어느 쪽이든 캔버스 밖까지 포인터를 따라간다.
   */
  readonly pointerSource?: 'window' | 'canvas';
  /**
   * 성능 판정을 덮어쓴다.
   *
   * 판정은 뷰포트를 읽는데, 큐브가 창보다 작아지는 순간 그 의미가 사라진다. 1000×620
   * 노트북은 `'mobile'`로 매겨지고 글로우 패스를 잃는다. 정해진 칸에 그리는 호스트는 어느
   * 쪽을 원하는지 말해야 한다. `tierFor` 참고.
   */
  readonly tier?: TierName;
  /**
   * 등급과 무관하게 글로우 패스를 돌릴지 여부.
   *
   * 등급은 묶음이다 — DPR 상한, 안티앨리어싱, 먼지 수, 글로우 패스가 전부 같이 움직인다 —
   * 그리고 그 묶음이 정확히 하나에 대해 틀렸다. 나머지 셋은 **품질**이고, 약한 기기에서
   * 떨어뜨리면 정밀도가 조금 손해다. 글로우는 품질이 아니다. 심이 곧 이 오브젝트의
   * **정체**이고, 패스가 없으면 거기에 맞춰 발광도 낮춰지므로(`createCoreMaterial`의
   * `tier.postfx` 인자 참고) 폰은 더 싼 빛나는 큐브가 아니라 회색 덩어리를 받는다.
   *
   * 이것만 켜는 게 그걸 되사는 제일 싼 방법이기도 하다. 이 패스는 필레이트를 쓰고 폰이
   * 부족한 게 필레이트지만, 폰의 캔버스는 작으므로 피라미드도 작다. 대신 데스크톱 등급을
   * 통째로 씌우면 안티앨리어싱이 붙고 DPR이 두 배가 되는데, 그건 패스 하나를 더하는 게
   * 아니라 **모든** 패스의 필을 곱하는 일이다.
   */
  readonly postfx?: boolean;
  readonly onProgress?: (fraction: number) => void;
  /** 테마를 적용할 때마다 호출된다. 호스트의 룩 개발 오버라이드를 다시 얹을 수 있도록. */
  readonly onThemeApplied?: () => void;
  /** 검증 하네스용으로 `window`에 `__charge`와 `__heat`를 노출한다. */
  readonly debug?: boolean;
}

const pointerTarget = new THREE.Vector2();
const pointerSmoothed = new THREE.Vector2();

export async function createCubeStage(options: CubeStageOptions): Promise<CubeStage> {
  const disposer = new Disposer();
  const detected: DeviceTier = options.tier ? tierFor(options.tier) : detectDeviceTier();
  // 등급 옆에 따로 넘기지 않고 등급 객체 자체를 덮어쓴다. `postfx`를 읽는 곳이 두 군데인데
  // 그 둘이 일치해야 하기 때문이다: 블룸 패스와, 코어 재질 — 후자의 발광은 그 패스를
  // 전제로 잡혀 있고 패스가 없으면 낮춰진다. 둘을 갈라놓으면 심이 흰색으로 클리핑되거나
  // 어두운 채로 남는다.
  const tier: DeviceTier =
    options.postfx === undefined || options.postfx === detected.postfx
      ? detected
      : { ...detected, postfx: options.postfx };
  const reducedMotion = prefersReducedMotion();

  const canvas = options.canvas;
  const drawBackdrop = options.backdrop ?? true;
  const pointerSource = options.pointerSource ?? 'window';
  const onProgress = options.onProgress ?? (() => {});
  debug.enabled = options.debug ?? false;

  onProgress(0.08);

  const bundle = createRenderer(canvas, tier, !drawBackdrop);
  const renderer = bundle.renderer;
  disposer.add(() => bundle.dispose());

  const scene = new THREE.Scene();

  onProgress(0.2);
  const textures = createTextureSet();
  disposer.add(() => disposeTextureSet(textures));

  onProgress(0.46);
  const environment = createEnvironment(renderer);
  scene.environment = environment.texture;
  disposer.add(() => environment.dispose());

  const backdrop = drawBackdrop ? createBackdrop() : null;
  if (backdrop) {
    backdrop.mesh.layers.set(NO_BLOOM_LAYER);
    scene.add(backdrop.mesh);
    disposer.add(() => backdrop.dispose());
  }

  // 가져올 것이 없다. 예전엔 여기서 흙바닥, 잔디 패치, 꽃 맵을 불러왔고 — 요청 세 번에
  // 약 1.7MB — 그건 이제 존재하지 않는 정원을 위한 것이었다. 큐브가 필요로 하는 모든
  // 텍스처는 대신 시작할 때 캔버스에 그려서 만든다. `textures.ts` 참고.
  onProgress(0.72);
  const hero: HeroRelic = createHeroRelic({ tier, textures });
  scene.add(hero.object3d);
  disposer.add(() => hero.dispose());

  // 그대로 넘기지 않고 조건부로 펼친다. `exactOptionalPropertyTypes` 아래에서는 명시적
  // `undefined`와 키가 아예 없는 것이 다르고, 리그의 기본값이 곧 원래 잡아 둔 구도다.
  const rig = createCameraRig({
    ...(options.composition ? { offset: options.composition } : {}),
    ...(options.portraitComposition ? { portraitOffset: options.portraitComposition } : {}),
    ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
  });
  // 메인 패스는 전부 그린다. 블룸 프리패스가 이걸 레이어 0과 1로 좁힌다.
  rig.camera.layers.enable(BLOOM_LAYER);
  rig.camera.layers.enable(NO_BLOOM_LAYER);
  disposer.add(() => rig.dispose());

  const bloom = createBloomPass(renderer, scene, tier.postfx);
  disposer.add(() => bloom.dispose());

  const state = createSubjectState();
  state.reducedMotion = reducedMotion;

  const stats: StageStats = {
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    dpr: 1,
    fps: 0,
    cubeletCount: hero.stats.cubeletCount,
    tier: tier.name,
  };

  // ── 조명 ──────────────────────────────────────────────────────────────────────────
  // 게인은 현재 테마의 토큰에 곱해진다. 그래서 테마가 무엇인지에 대한 권위는 `theme.ts`에
  // 남고, 여기서는 그에 대해 "더" 혹은 "덜"이라고만 말한다. 해결된 대상으로 복사하지 않고
  // 모듈에서 직접 읽는데, 구도가 하나뿐이라 복사본이 보간될 대상이 없고, 룩 개발 패널이
  // `LOOK`을 제자리에서 바꾸는 것이 곧 다음 프레임에 닿아야 할 바로 그것이기 때문이다.
  const look = LOOK;
  const themeGains = { key: 1, rim: 1, fill: 1, env: 1, ao: 1, shadow: 1, bloom: 1, seam: 1, exposure: 1 };
  const rigSettings = { ...RIG_DEFAULTS };
  const aoSettings = { ...STONE_AO_DEFAULTS };
  const shadowSettings = { ...SHADOW_DEFAULTS };

  const applyLook = (): void => {
    rigSettings.keyAzimuth = look.keyAzimuth;
    rigSettings.keyElevation = look.keyElevation;
    rigSettings.keyDistance = look.keyDistance;
    rigSettings.keyGain = look.keyGain * themeGains.key;
    rigSettings.rimAzimuth = look.rimAzimuth;
    rigSettings.rimElevation = look.rimElevation;
    rigSettings.rimGain = look.rimGain * themeGains.rim;
    rigSettings.fillGain = look.fillGain * themeGains.fill;
    rigSettings.emberGain = look.emberGain;
    rigSettings.emberRange = look.emberRange;
    hero.tuning.lighting.setRig(rigSettings);

    aoSettings.groove = look.aoGroove;
    aoSettings.strength = look.aoGain * themeGains.ao;
    hero.tuning.stone.setAo(aoSettings);

    // 호스트의 그림자 오버라이드가 조명 값 위에 얹힌다. 그래서 `LOOK`이 원래의 답으로
    // 남고, 여기서는 "이 프레임에서는 더 좁게"라고만 말한다.
    const shadowSpread = options.shadow?.spread ?? look.shadowSpread;
    const shadowHeight = options.shadow?.height ?? look.shadowHeight;
    const shadowOffsetZ = options.shadow?.offsetZ ?? look.shadowOffsetZ;

    shadowSettings.opacityScale = look.shadowGain * SHADOW_DEFAULTS.opacityScale;
    shadowSettings.spreadRelic = shadowSpread;
    shadowSettings.spreadAssembly = shadowSpread;
    shadowSettings.heightRelic = shadowHeight;
    shadowSettings.heightAssembly = shadowHeight;
    shadowSettings.offsetZ = shadowOffsetZ;
    hero.tuning.shadow.setSettings(shadowSettings);

    bloom.setGlow(
      look.bloomGain * themeGains.bloom,
      look.bloomThreshold,
      look.bloomRadius,
      look.bloomHaze * themeGains.bloom,
    );
    hero.tuning.seam.setIntensity(look.seamGain * themeGains.seam);
    renderer.toneMappingExposure = look.exposureGain * themeGains.exposure;
    // 글로우 패스는 곡선의 사본을 따로 갖는다 — `toneMapped`를 끈 채 캔버스로 그리는
    // ShaderMaterial은 `renderer.toneMappingExposure`를 절대 못 본다 — 그래서 노출을
    // 직접 넘겨줘야 하고, 안 그러면 후광과 그것이 얹힌 프레임이 서로 어긋난다.
    bloom.setExposure(renderer.toneMappingExposure);
    scene.environmentIntensity = look.envGain * themeGains.env;
  };

  // ── 포인터가 어디 있는가, 캔버스 자신의 좌표계에서 ────────────────────────────────
  //
  // 아래의 모든 제스처는 정규화 장치 좌표(NDC)로 표현되는데, 예전에는 캔버스가 곧
  // 뷰포트라는 논리로 `window.innerWidth`와 `window.innerHeight`에 대해 계산했다. 대신
  // 캔버스에 대해 재면 같은 산수가 두 경우 모두에서 맞는다 — 고정에 inset-0인 캔버스는
  // 곧 뷰포트라서 전체 화면일 때의 숫자가 그대로 나오고, 임베드된 캔버스는 자기 오프셋만큼
  // 어긋나던 것이 없어진다.
  //
  // 사각형은 이벤트마다 읽지 않고 캐시한다. `getBoundingClientRect`는 레이아웃을 강제하고,
  // 그걸 하는 pointermove는 프레임을 멈출 수 있는 pointermove다. 캔버스가 리사이즈될 때와
  // 각 제스처가 시작될 때 갱신하는데, 그러면 드래그 도중에 움직이는 엘리먼트 말고는 전부
  // 커버된다 — 그리고 그렇게 움직이는 엘리먼트에는 이것보다 큰 문제가 있다.
  const rect = { left: 0, top: 0, width: 1, height: 1 };

  const measure = (): void => {
    const box = canvas.getBoundingClientRect();
    rect.left = box.left;
    rect.top = box.top;

    if (box.width >= 2 && box.height >= 2) {
      rect.width = box.width;
      rect.height = box.height;
      return;
    }

    // ── 캔버스에 아직 박스가 없다 ────────────────────────────────────────────────────
    //
    // 딱 한 번, 생성 시점에만 일어나고, 그것도 호출 시점까지 호스트의 스타일시트가 적용되지
    // 않았을 때만이다. Vite 개발 서버는 CSS를 자바스크립트에서 주입하므로, 순수 HTML 부팅은
    // 캔버스가 여전히 고유 크기 300×150이거나 아예 0인 채로 여기 도달할 수 있다. 그래서
    // 아직 안 올라온 그것 대신 뷰포트에 대해 잰다. 뷰포트는 언제나 거기 있기 때문이고,
    // 이게 방어 코드가 아니라 올바른 폴백인 이유이기도 하다 — 창을 채우는 캔버스에게는
    // 이게 **정답**이고, 이 코드가 쓰인 배치가 바로 그것이다.
    //
    // 레이아웃 이펙트에서 마운트된 임베드 캔버스는 이 코드가 돌 때 이미 배치가 끝나 있으므로
    // 위 분기를 타고 여기를 보지 않는다. 혹시 아니더라도 `ResizeObserver`가 다음 렌더링
    // 단계에 진짜 박스를 주고 아래 전부가 다시 계산된다 — 이건 첫 프레임이 1×1이 되는 것만
    // 막으면 된다.
    rect.width = Math.max(1, window.innerWidth);
    rect.height = Math.max(1, window.innerHeight);
  };

  measure();

  // ── 큐브를 붙잡기 ─────────────────────────────────────────────────────────────────
  //
  // 포인터 하나에 제스처 둘. 눌린 순간 아래에 무엇이 있었는지로 갈린다. 면 위면 한 줄을
  // 잡은 것이고, 빈 캔버스면 큐브 전체를 잡은 것이다. 어느 쪽이든 붙잡고 있는 동안 손을
  // 1:1로 따라오고, 놓으면 손의 속도를 안고 간다.
  //
  // 예전의 누름은 **튕기기**였다. 방향이 잡히는 순간 정확히 4분의 1 회전 하나를 쏘고
  // 제스처는 거기서 끝났다 — 첫 45px 이후의 모든 것이 아무 일도 하지 않았다. 그 어디에도
  // 이 물건에 무게가 있다는 말은 없었다.
  const turnNdc = new THREE.Vector2();
  let dragPointer: number | null = null;

  const toNdc = (event: PointerEvent): void => {
    turnNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  };

  const onPointerDown = (event: PointerEvent): void => {
    // `window`에서 들을 때만 의미가 있다. 거기서는 로그인 폼을 누른 것이 그 뒤의 큐브를
    // 누른 것이 되어 버리기 때문이다. 캔버스에서 들으면 애플리케이션의 요소들이 쌓임
    // 순서상 위에 있어서 애초에 여기까지 오지 않는다.
    if (pointerSource === 'window') {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('a, button, input, select, textarea, label, [role="button"]')
      ) {
        return;
      }
    }
    measure();
    toNdc(event);
    if (hero.beginDrag(turnNdc, rig.camera)) dragPointer = event.pointerId;
  };

  const onDragMove = (event: PointerEvent): void => {
    if (dragPointer !== event.pointerId) return;
    toNdc(event);
    // 제스처 내내 붙잡고 있는다. 예전엔 회전이 발동하는 순간 `dragPointer`를 비웠는데,
    // 누름이 곧 회전 하나이던 시절엔 맞았고 그게 붙잡기가 된 지금은 정확히 틀렸다 —
    // 데드존을 넘는 첫 프레임에 포인터를 놓아 버려서, 여전히 붙잡고 있는 손을 큐브가 따라오지
    // 않게 되고 모든 던지기가 속도 0으로 놓아졌다.
    hero.dragTo(turnNdc);
  };

  const onDragEnd = (event: PointerEvent): void => {
    if (dragPointer !== event.pointerId) return;
    hero.endDrag();
    dragPointer = null;
  };

  // 누름은 범위를 제한하지만 이동과 뗌은 아니고, 그래서도 안 된다 — 던지는 도중 캔버스를
  // 벗어난 손도 여전히 큐브를 붙잡고 있고, 캔버스 밖에서의 pointerup도 도착해야 한다.
  if (pointerSource === 'canvas') {
    disposer.listen(canvas, 'pointerdown', onPointerDown, { passive: true });
  } else {
    disposer.listen(window, 'pointerdown', onPointerDown, { passive: true });
  }
  disposer.listen(window, 'pointermove', onDragMove, { passive: true });
  disposer.listen(window, 'pointerup', onDragEnd, { passive: true });
  disposer.listen(window, 'pointercancel', onDragEnd, { passive: true });

  // ── 포인터를 따라 기울기 ──────────────────────────────────────────────────────────
  const fine = hasFinePointer();

  if (fine) {
    const onPointerMove = (event: PointerEvent): void => {
      pointerTarget.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        ((event.clientY - rect.top) / rect.height) * 2 - 1,
      );
    };
    disposer.listen(window, 'pointermove', onPointerMove, { passive: true });

    const onPointerLeave = (): void => {
      pointerTarget.set(0, 0);
    };
    disposer.listen(document, 'pointerleave', onPointerLeave, { passive: true });
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    // 권한 게이트가 없는 환경에만 붙인다. 방향 센서 권한은 절대 묻지 않는다.
    const gated = 'requestPermission' in DeviceOrientationEvent;
    if (!gated) {
      const onOrientation = (event: DeviceOrientationEvent): void => {
        const gamma = event.gamma ?? 0;
        const beta = event.beta ?? 0;
        pointerTarget.set(clamp01((gamma + 45) / 90) * 2 - 1, clamp01((beta - 20) / 90) * 2 - 1);
      };
      disposer.listen(window, 'deviceorientation', onOrientation, { passive: true });
    }
  }

  // ── 리사이즈 ──────────────────────────────────────────────────────────────────────
  //
  // 뷰포트가 아니라 캔버스 자신의 박스가 구동한다. `setSize`의 세 번째 인자가 false라서
  // 렌더러는 CSS를 절대 쓰지 않고 레이아웃은 호스트의 몫으로 남는다 — 엘리먼트를 관찰하는
  // 것이 피드백 루프가 아니라 안전한 일이 되는 이유이기도 하다.
  const resize = (): void => {
    measure();
    const width = rect.width;
    const height = rect.height;
    bundle.resize(width, height);
    const framing = options.framing ?? 'auto';
    const portrait = framing === 'auto' ? width / height < 0.85 : framing === 'portrait';
    // 카메라는 뷰포트의 순수 함수다 — `cameraRig.ts` 참고 — 그래서 카메라를 배치하는 곳은
    // 여기 한 군데뿐이다.
    rig.setViewport(width, height, portrait);
    backdrop?.setAspect(width / height);
    backdrop?.setFocus(rig.focus.x, rig.focus.y);
    bloom.setSize(width * bundle.state.dpr, height * bundle.state.dpr);
    stats.dpr = bundle.state.dpr;
  };

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    disposer.add(() => observer.disconnect());
  }
  // 관찰자의 폴백이 아니라 관찰자와 나란히 둔다. 캔버스는 박스를 그대로 둔 채 그 아래의
  // **기기 픽셀 비율**만 바뀔 수 있는데 — 레티나 디스플레이와 외부 모니터 사이로 창을
  // 끌면 정확히 그렇게 된다 — 그때는 리사이즈된 엘리먼트가 없으므로 관찰자가 아예 안 뜬다.
  disposer.listen(window, 'resize', resize, { passive: true });

  const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  disposer.listenMedia(dprQuery, resize);

  resize();
  onProgress(0.86);

  // ── 테마 ──────────────────────────────────────────────────────────────────────────
  //
  // 한 번 해결하고 그 뒤로는 제자리에서 바꾼다. 이 레코드는 열몇 개의 유니폼에 참조로
  // 붙들려 있어서, 전환할 때마다 새로 만들면 여전히 옛것을 가리키는 모든 재질이 미아가 된다.
  const resolved = resolveCubeTheme(options.theme ?? 'dark');

  const publishTheme = (): void => {
    // 테마 자신의 값을 캐시한다. `applyLook`이 매 프레임 여기에 조명의 게인을 곱하므로,
    // 두 계층 중 어느 쪽도 상대를 알 필요가 없다.
    themeGains.key = 1;
    themeGains.rim = 1;
    themeGains.fill = 1;
    themeGains.env = resolved.scalars.envIntensity;
    themeGains.ao = resolved.scalars.aoStrength;
    themeGains.shadow = 1;
    themeGains.bloom = resolved.scalars.bloomStrength;
    themeGains.seam = resolved.scalars.seamEmissive;
    themeGains.exposure = resolved.scalars.exposure;

    backdrop?.applyTheme(resolved);
    hero.applyTheme(resolved);
    bloom.applyTheme(resolved);
    options.onThemeApplied?.();
  };

  publishTheme();

  // ── 셰이더 예열 ───────────────────────────────────────────────────────────────────
  //
  // 재질의 프로그램은 그 오브젝트가 실제로 처음 그려질 때 컴파일되고, three는 **보이는**
  // 오브젝트만 훑는다. 스물일곱 개 몸통은 등장이 시작되기 전까지 숨겨져 있으므로, 그냥 두면
  // 큐브가 처음 나타나는 그 한 프레임에 모든 프로그램이 한꺼번에 컴파일된다 — 그 프레임이
  // 케이지가 부서지는 순간이던 시절에 692ms로 측정됐다.
  //
  // 컴파일 패스 한 번을 위해 씬을 강제로 보이게 하면 그 비용이, 이 promise가 아직 안 풀린
  // 동안 호스트가 보여주고 있는 것 뒤로 옮겨간다. `compileAsync`는 드라이버가 지원하면
  // `KHR_parallel_shader_compile`도 기다리므로, 프로그램이 그냥 큐에 들어간 게 아니라
  // 진짜로 준비된다.
  const hiddenDuringWarmUp: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (!node.visible) {
      hiddenDuringWarmUp.push(node);
      node.visible = true;
    }
  });
  await renderer.compileAsync(scene, rig.camera);
  for (const node of hiddenDuringWarmUp) node.visible = false;

  onProgress(0.94);

  // ── 루프 ──────────────────────────────────────────────────────────────────────────
  const timer = new THREE.Timer();
  let frameHandle = 0;
  let running = false;
  let fpsAccumulator = 0;
  let fpsFrames = 0;

  const frame = (): void => {
    frameHandle = requestAnimationFrame(frame);
    renderer.info.reset();
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const time = timer.getElapsed();

    // 스크롤 위치가 아니라 벽시계가 구동한다. 등장은 한 번 재생되고 그 뒤는 전부 쉬는
    // 상태다. `state.ts` 참고.
    evaluateSubject(state, time, reducedMotion);

    if (!fine && !reducedMotion && state.pointerAmount > 0) {
      // 터치 기기는 포인터 추적 대신 느린 자율 유휴 동작을 받는다.
      pointerTarget.set(Math.sin(time * 0.24) * 0.55, Math.sin(time * 0.17) * 0.3);
    }
    pointerSmoothed.x = damp(pointerSmoothed.x, pointerTarget.x, 4.5, dt);
    pointerSmoothed.y = damp(pointerSmoothed.y, pointerTarget.y, 4.5, dt);

    // 싸고, 변경 시가 아니라 매 프레임 다시 적용한다. 그래야 룩 개발 패널이 `LOOK`에 가한
    // 편집이 패널 쪽에서 아무것도 호출하지 않고도 다음 프레임에 닿는다.
    applyLook();

    hero.update(state, time, dt, pointerSmoothed, bundle.state.dpr);

    renderer.render(scene, rig.camera);
    bloom.render(rig.camera);

    fpsAccumulator += dt;
    fpsFrames++;
    if (fpsAccumulator >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsAccumulator);
      stats.drawCalls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.geometries = renderer.info.memory.geometries;
      stats.textures = renderer.info.memory.textures;
      stats.programs = renderer.info.programs?.length ?? 0;
      fpsAccumulator = 0;
      fpsFrames = 0;
    }
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(frameHandle);
  };

  disposer.add(stop);

  return {
    stats,
    state,
    root: scene,
    camera: rig.camera,
    environment,

    setTheme(theme) {
      applyCubeTheme(resolved, theme);
      publishTheme();
    },

    start() {
      if (running) return;
      running = true;
      bloom.refreshOccluders();
      frame();
    },

    stop,

    resize,

    dispose() {
      disposer.run();
      // 이중 안전장치. 위에서 각 서브시스템이 자기 리소스를 놓은 다음, 씬을 한 번 훑어서
      // 여기 붙었던 적이 있는 것은 무엇도 살아남지 못하게 한다.
      disposeObject(scene);
      scene.clear();
    },
  };
}

import * as THREE from 'three';
import {
  RELIC_SETTLED_YAW,
  createPlateShellGeometry,
  createCoreGeometry,
  createCoreMaterial,
  createStoneMaterial,
  type StoneMaterial,
  type SeamMaterial,
} from './relicCube';
import {
  ASSEMBLY_EDGE,
  CLICK_OMEGA,
  CUBELET_EDGE,
  LATTICE_STEP,
  createRubik,
  type Rubik,
  type SliceAxis,
} from './rubik';
import { createMotes, type Motes } from './motes';
import { createContactShadow, type ContactShadow } from './contactShadow';
import { createLighting, type LightingRig } from '../scene/lighting';
import { BLOOM_LAYER, NO_BLOOM_LAYER } from '../scene/postfx';
import { damp, smootherstep } from '../lib/math';
import { debug } from '../lib/debug';
import type { ResolvedTheme } from '../theme';
import type { SubjectState } from '../story/state';
import type { DeviceTier } from '../lib/deviceTier';
import type { TextureSet } from './textures';

/**
 * 주인공 오브젝트 — 큐브 전체가 진입점 하나 뒤에 있다.
 *
 * 자기 지오메트리, 재질, 조립체, 먼지, 접지 그림자, 그리고 자기 3점 조명 리그를 소유하고,
 * DOM이나 주변 페이지에 대해서는 아무것도 모른다. `SubjectState`(평범한 데이터 계약)와
 * 포인터 벡터로 구동하고, `dispose()`로 전부 놓는다. 피드 카드나 프로필 헤더에 넣는다는 건
 * `hero.object3d`를 씬에 추가하고 `update`를 부르는 것을 뜻한다.
 *
 * 예전엔 오프닝 제스처도 소유했다 — 격자 크기의 그려지는 와이어프레임 케이지와 그것을
 * 감싸던 두 손 — 그래서 손 텍스처와, 그것들을 실제 절두체에 다시 맞추는 `layout`을 받았다.
 * 식재도 실어 날랐다. 윗면에서 솟아오르는 흙바닥, 풀밭, 꽃밭이, 그것들을 쓰던 장면이 사라진
 * 뒤로도 한참 동안 "언젠가 돌아온다"는 논리로 옵션 타입에 남아 있었다. 돌아오지 않는다 —
 * 이 페이지 위쪽 전부가 이미지 시퀀스로 다시 만들어지고 있다 — 그래서 케이지와 손과 정원
 * 전체는 잠들어 있는 게 아니라 삭제됐다.
 *
 * 그렇게 남은 것이 **바이너리 에셋이 하나도 없는** 오브젝트다. 돌, 먼지 스프라이트, 접지
 * 그림자가 전부 런타임에 캔버스로 생성되므로(`textures.ts`), 이걸 다른 페이지에 넣는 일은
 * 소스를 복사하는 것으로 끝난다. 호스팅할 것도, 로딩 순서를 맞출 것도 없다.
 */

export interface HeroRelicOptions {
  readonly tier: DeviceTier;
  readonly textures: TextureSet;
}

export interface HeroRelicStats {
  readonly cubeletCount: number;
}

/**
 * 조명 패스와 개발용 튜닝 패널이 구동하는 살아 있는 핸들들.
 *
 * 이제 하나하나가 다시 단일 객체다. 한때는 설정 하나를 복제본들에 뿌리려고 넓혔었다 —
 * 돌 재질 둘, 코어 둘, 케이지 둘 — 격자 옆에 2.2짜리 유물이 따로 존재하던 시절이라 조명
 * 설정 하나가 양쪽에 다 닿아야 했고, 안 그러면 마지막 비트에서 두 표면이 같은 조명에 대해
 * 다른 말을 했다. 큐브 하나에 각각 하나씩이므로 그 간접층은 사라졌다.
 */
export interface HeroTuningTargets {
  readonly lighting: LightingRig;
  readonly stone: StoneMaterial;
  readonly seam: SeamMaterial;
  readonly shadow: ContactShadow;
}

export interface HeroRelic {
  readonly object3d: THREE.Group;
  readonly stats: HeroRelicStats;
  readonly tuning: HeroTuningTargets;
  /**
   * 몸통을 눌러 붙잡는다. 아무것도 맞지 않았거나 큐브가 안정 상태가 아니면 false를
   * 반환하고, 그때 호출자는 그 제스처를 원래 의미대로 처리하면 된다.
   */
  beginDrag(ndc: THREE.Vector2, camera: THREE.PerspectiveCamera): boolean;
  /**
   * 드래그. 포인터가 방향을 가질 만큼 이동하고 나면 그 아래의 줄이 그 방향으로 돌고 제스처는
   * 소진된다 — 다음 누름 전까지 더 움직여도 아무 일도 없다. 회전이 실제로 발동한 프레임에
   * true를 반환한다.
   */
  dragTo(ndc: THREE.Vector2): boolean;
  /** 놓기. 회전이 발동했든 안 했든 안전하게 호출할 수 있다. */
  endDrag(): void;
  /** 애니메이션을 진행시킨다. `pointer`는 [-1, 1] 범위의 정규화 장치 좌표다. */
  update(state: SubjectState, time: number, dt: number, pointer: THREE.Vector2, dpr: number): void;
  applyTheme(theme: ResolvedTheme): void;
  dispose(): void;
}

/**
 * 등장 시간 중 격자가 도착하는 데 쓰는 비율.
 *
 * 일부러 일찍 끝난다. 결(grain)이 곧 **사건**이므로, 디더와 도착이 같은 프레임에 끝나는 게
 * 아니라 그 끝에 완성된 큐브의 순간이 있어야 한다. rubik.ts의 `CLOSING_SPREAD`는 끝까지
 * 가므로, 남은 이동은 이미 단단해진 격자를 딸깍 닫는 데 쓰인다.
 */
const LATTICE_FADE_SHARE = 0.72;
/** 격자 바깥 크기의 절반 — 제스처 감도를 재는 기준이다. */
const ASSEMBLY_HALF = ASSEMBLY_EDGE / 2;
const POINTER_LIMIT = THREE.MathUtils.degToRad(18);
/** 커서 속도(초당 정규화 장치 좌표). 이보다 느리면 멈춘 것으로 본다. */
const POINTER_IDLE_SPEED = 0.05;
/** 유물이 안착 방향으로 돌아가기까지 멈춰 있어야 하는 초. */
const POINTER_IDLE_DELAY = 2;

/**
 * 유휴 표류가 한 바퀴 도는 데 걸리는 초.
 *
 * 이게 전환 효과이던 시절의 16초보다 느리다. 이제 전환이 아니다 — 로그인 화면이 바라보고
 * 있는 물건의 쉬는 상태이고, 옆의 카피와 경쟁하는 게 아니라 그 아래에 머물러야 한다.
 * 28초면 면 하나가 화면을 가로지르는 데 7초쯤 걸리는데, 그건 움직임이 아니라 살아 있음으로
 * 읽힌다.
 */
const TUMBLE_PERIOD = 28;
const TURN = Math.PI * 2;
/** 표류가 도는 방향: +1이면 가까운 면이 오른쪽으로, −1이면 왼쪽으로 간다. */
const TUMBLE_DIRECTION = 1;

const scratchSlotSpace = new THREE.Matrix4();
const scratchQuatA = new THREE.Quaternion();
const scratchQuatB = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3(0.42, 1, 0.28).normalize();
const scratchEuler = new THREE.Euler();

const raycaster = new THREE.Raycaster();
const scratchHit = new THREE.Vector3();
const scratchOffset = new THREE.Vector3();
const scratchProject = new THREE.Vector3();
const scratchNdcOrigin = new THREE.Vector2();
const scratchNdcTip = new THREE.Vector2();
const scratchDragVec = new THREE.Vector3();
const scratchAxisVec = new THREE.Vector3();

const AXIS_NAMES: readonly SliceAxis[] = ['x', 'y', 'z'];

/**
 * 누름이 방향이 되기까지 포인터가 이동해야 하는 거리(정규화 장치 좌표). 0.045는 노트북
 * 화면에서 대략 손가락 하나 너비다 — 손이 떨리는 클릭도 클릭으로 남을 만큼 넉넉하다.
 */
const DRAG_THRESHOLD = 0.045;

// ── 충전, 그리고 빛에게 그것이 요청되는 때 ──────────────────────────────────────────
//
// 채널 하나에 원천 둘. 회전이 여기에 스파이크를 주고 그 회전 길이쯤에 걸쳐 감쇠한다. 그
// 아래에서 느린 너울이 이 값이 평평하게 눕는 것을 막는다. 둘 다 같은 유니폼을 먹이는데,
// 합이 아니라 최댓값으로 취한다. 그래야 회전 도중에 도착한 너울이 총량을 회전 하나의
// 값어치 너머로 밀어 올리지 못한다.

/**
 * 회전의 충전이 얼마나 빨리 잦아드는가(1/초).
 *
 * 임의로 고른 게 아니라 회전에 맞췄다. 클릭의 회전은 대략 1.4초면 시각적으로 끝나는데
 * (rubik.ts의 `SETTLE_EPSILON` 참고), 2.0이면 그 시점에 충전이 최고치의 5분의 1이다.
 * 빛과 움직임이 함께 끝나고, 그게 섬광이 그 회전에 **관한** 것이냐 그저 그 근처에서 일어난
 * 것이냐의 차이다.
 */
const CHARGE_DECAY = 2.0;

/**
 * 충전이 오르는 속도와 내리는 속도(1/초).
 *
 * 비대칭이고, 그래야만 한다. 하나의 속도로는 양쪽 끝을 다 감당할 수 없기 때문이다. 펄스는
 * 1.0으로 계단처럼 뛴 뒤 `CHARGE_DECAY`로 떨어지는데, 9로 대칭 추종을 걸었더니 그 계단을
 * 따라잡느라 시간을 다 써서 최고치가 **0.65**에 그쳤고 도착하기도 전에 도로 내려가기
 * 시작했다 — 보기 좋게 만들려던 평활화가 효과의 3분의 1을 버린 것이다.
 *
 * 빨라야 하는 쪽은 상승이다. 빛이 누름에 답하는 순간이 그것이다. 하강은 평활화가 아예
 * 필요 없다. `turnCharge` 자체가 이미 감쇠하는 지수함수이고, 이 속도는 그것이 계단이 되지
 * 않게만 해 준다. 상승 26이면 최고치가 0.81에 떨어진다.
 */
const CHARGE_ATTACK = 26;
const CHARGE_RELEASE = 14;

/**
 * 쉴 때의 너울: 초당 라디안, 그리고 한 주기 중 조용히 보내는 비율.
 *
 * 평범한 사인은 멈추지 않는 맥박이고, 로그인 폼 옆에서 그건 주기를 가진 방해물이다.
 * `0.5 + 0.5·sin`을 6제곱하면 한 주기의 대부분을 0 근처에서 보내다가 잠깐 솟는다 —
 * 가끔이라는 성질, 그게 이걸 반복되는 애니메이션이 아니라 오브젝트가 자기 일을 하는 것으로
 * 읽히게 만든다. 0.55 rad/s면 정점이 대략 11초마다 돌아온다.
 */
const SWELL_RATE = 0.55;
const SWELL_SHARPNESS = 6;

/**
 * 쉴 때의 너울이 어디까지 올라가는가. 회전의 1.0에 대해서.
 *
 * 회전에는 못 미치지만, 예전만큼 못 미치지는 않는다. 0.34에서는 쉴 때의 너울이 측정은 되되
 * 그냥 놓치기 쉬운 수준이었고, 그러면 그건 행동이 아니라 장식이다. 0.5면 후광이 스스로
 * 따뜻해지는 게 눈에 보인다. 그래도 회전보다는 한참 아래다 — 오브젝트가 숨쉬는 것은 오브젝트가
 * 당신에게 답하는 것보다 확연히 작아야 하고, 안 그러면 그 답이 답으로 등록되지 않는다.
 */
const SWELL_PEAK = 0.5;

/**
 * 큐브를 완전히 달구는 데, 그리고 다시 식히는 데 필요한 **회전**의 초.
 *
 * 열은 여기서 유일하게 사건이 아니라 상태인 채널이다. 무언가 실제로 움직인 시간을 적분하므로,
 * 그게 긴 던지기 하나에서 왔든 짧은 클릭 여덟 번에서 왔든 상관하지 않는다 — 두 경우 모두에
 * 대해 그게 옳은 답이고, 누산기 하나가 "회전이 오래 돌수록"과 "많이 돌릴수록"을 함께
 * 담당하는 이유다.
 *
 * 회전 5.5초는 연속 클릭 여섯 번이나 큰 던지기 세 번쯤이다. 가지고 노는 사람은 빨강을
 * 찾아내고, 두 번 돌려 보고 로그인 폼으로 돌아가는 사람은 결코 못 보는 거리다. 식는 게
 * 달아오르는 것보다 느린 건 의도적이다 — 물건은 열을 얻을 때보다 잃을 때 더 인색하고,
 * 멈추는 즉시 호박색으로 되튀는 큐브는 무언가 가라앉는 게 아니라 전등이 꺼지는 것으로 읽힌다.
 */
const HEAT_UP_SECONDS = 5.5;
const HEAT_DOWN_SECONDS = 8;

/**
 * 클릭 데드존의 반너비. 한 칸 한 변에 대한 비율이다.
 *
 * 중심 양쪽으로 0.1씩 — 칸의 가운데 5분의 1이다. 로그인 프레이밍에서 몸통 하나가 대략
 * 175px이므로 이건 35px 띠다. 모서리를 겨냥한 사람은 항상 맞힐 만큼 작고, "그냥 보려고" 한
 * 누름은 아무 일도 안 일으킬 만큼 넓다.
 */
const CLICK_DEAD_ZONE = 0.1;

/**
 * 클릭된 면이 어느 축을 향하는가. 법선이 아니라 충돌 지점에서 구한다.
 *
 * 법선은 격자와 비교하려면 메시의 오브젝트 공간에서 노멀 행렬 둘을 거쳐 나와야 하고, 게다가
 * 그건 **모따기된** 법선이라 모서리 근처의 둥근 판에서는 자기가 속한 면에서 꽤 벗어난 쪽을
 * 가리킬 수 있다. 몸통 자신의 중심에서 충돌 지점까지의 오프셋에는 두 문제가 다 없다.
 * 모서리가 아무리 둥글어도 그 지배적 성분은 정확히 그 면이다.
 */
function dominantAxis(offset: THREE.Vector3): SliceAxis {
  const ax = Math.abs(offset.x);
  const ay = Math.abs(offset.y);
  const az = Math.abs(offset.z);
  if (ax >= ay && ax >= az) return 'x';
  return ay >= az ? 'y' : 'z';
}

export function createHeroRelic(options: HeroRelicOptions): HeroRelic {
  const { tier, textures } = options;

  const object3d = new THREE.Group();
  object3d.name = 'hero-relic';

  /** 표류, 안착 요, 포인터 추적을 실어 나른다. */
  const spinRoot = new THREE.Group();
  spinRoot.name = 'hero-spin';
  object3d.add(spinRoot);

  // ── 재질 — 한 번 만들고 테마가 바뀔 때만 변경한다 ────────────────────────────────
  //
  // 한 쌍을 스물일곱 개 몸통 전부가 공유한다.
  //
  // 격자 옆에 2.2짜리 유물이 존재하던 동안에는 두 쌍이었다. `uReveal`은 유니폼이라 메시가
  // 아니라 재질에 속하는데, 조각들을 디더로 들여오면서 유물을 디더로 내보내려면 둘이 공유할
  // 수 없었다. 유물이 사라진 지금은 붙들어 둘 것이 없다 — 모든 몸통이 같은 넘겨받기에
  // 도착하므로 모든 몸통을 같은 유니폼 두 개로 구동할 수 있다.
  //
  // 프로그램 비용은 어느 쪽이든 같은데, 한때 엉뚱한 것에 책임이 돌아갔으므로 왜인지 적어
  // 둘 만하다. `customProgramCacheKey`는 three가 캐시를 인스턴스가 아니라 재질 **파라미터**로
  // 키잉하게 만들므로, 모든 파라미터가 일치하는 두 재질은 이미 프로그램 하나를 공유하고
  // 있었다. 개수가 22 → 24로 갔을 때 캐시를 갈라놓은 건 `transparent`였고, 그건 그 자체가
  // 키의 일부다. 등장이 이제 discard이므로 이것들은 불투명하게 남고 아무것도 갈라지지 않는다.
  const stone = createStoneMaterial(textures.stone);
  // 코어의 발광은 글로우 패스를 전제로 잡은 값이라, 그 패스 없이 도는 등급에는 알려 줘야
  // 한다. 스케일하지 않으면 9.6은 세 채널 클리핑에 흰 홈이다.
  const seam = createCoreMaterial(CUBELET_EDGE * 0.5, textures.stone, tier.postfx);

  // ── 지오메트리 — 27개 몸통이 공유한다 ────────────────────────────────────────────
  // 각 몸통은 빛나는 코어를 여섯 판이 감싼 껍질이다. 껍질은 병합된 버퍼 하나이고 코어는
  // 상자 하나라, 몸통 하나가 정확히 드로우콜 두 번이다.
  const cubeletGeometry = createPlateShellGeometry(CUBELET_EDGE, 3);
  const cubeletSeamGeometry = createCoreGeometry(CUBELET_EDGE);

  const makeCubelet = (): THREE.Object3D => {
    const mesh = new THREE.Mesh(cubeletGeometry, stone.material);
    // 돌은 그림자를 받되 절대 드리우지 않는다. 몸통이 자기 자신에 그림자를 지워 봐야 눈에
    // 보이는 이득이 없고, 뎁스 패스에 드로우 스물일곱 개를 더하는 건 프레임 예산 전체를
    // 거기에 쓰는 일이다.
    mesh.receiveShadow = true;
    const coreMesh = new THREE.Mesh(cubeletSeamGeometry, seam.material);
    coreMesh.layers.enable(BLOOM_LAYER);
    mesh.add(coreMesh);
    return mesh;
  };

  const rubik: Rubik = createRubik(makeCubelet);
  spinRoot.add(rubik.root);

  const motes: Motes = createMotes(tier, textures.mote);
  motes.group.children.forEach((child) => child.layers.enable(BLOOM_LAYER));
  object3d.add(motes.group);

  const shadow: ContactShadow = createContactShadow(textures.shadow);
  shadow.mesh.layers.set(NO_BLOOM_LAYER);
  object3d.add(shadow.mesh);

  const lighting: LightingRig = createLighting(tier);
  object3d.add(lighting.group);

  // ── 포인터 상태 ──────────────────────────────────────────────────────────────────
  const pointerCurrent = new THREE.Vector2();
  const pointerLast = new THREE.Vector2();
  let idleTime = 0;

  /** 지금까지 표류한 라디안. 상한이 없고 오직 증가만 한다. */
  let tumbleAngle = 0;

  /** 회전이 실제로 시작되는 순간 1이 되고 그 뒤 감쇠한다. `CHARGE_DECAY` 참고. */
  let turnCharge = 0;
  /** 심 재질에 실제로 주는 값 — 두 원천을 감쇠 추종한 결과. */
  let charge = 0;
  /** 누적된 작업 열, 0…1. `HEAT_UP_SECONDS` 참고. */
  let heat = 0;

  const settledQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, RELIC_SETTLED_YAW, 0),
  );

  // ── 끌어서 돌리기 ────────────────────────────────────────────────────────────────
  //
  // 제스처에 필요한 모든 것. 누를 때 한 번 결정하고 움직일 때마다 읽는다: 어느 몸통을
  // 붙잡았는지, 그 몸통의 어느 면인지, 그리고 그 면 자신의 두 축이 지금 화면에서 어디를
  // 가리키는지. 움직일 때마다가 아니라 누를 때 결정하는 이유는 큐브가 내내 표류하고 있기
  // 때문이다 — 드래그 도중에 투영을 다시 샘플링하면 사용자의 손가락 아래에서 답이 바뀐다.
  const drag = {
    active: false,
    /** 포인터가 줄을 점유할 만큼 이동하고 나면 true. */
    grabbed: false,
    startX: 0,
    startY: 0,
    centre: new THREE.Vector3(),
    faceVec: new THREE.Vector3(),
    axisA: 'x' as SliceAxis,
    axisB: 'y' as SliceAxis,
    screenA: new THREE.Vector2(),
    screenB: new THREE.Vector2(),
    /** 살아 있는 포인터 위치. `dragTo`가 쓰고 `update`가 소비한다. */
    current: new THREE.Vector2(),
    /** 제스처가 확정한 축의 화면상 방향. */
    dragDir: new THREE.Vector2(),
    /** +1 또는 −1: 화면상 양의 변위가 선택된 축을 어느 쪽으로 돌리는가. */
    turnSign: 1,
    /** 붙잡은 순간의 `dragDir` 방향 변위 — 데드존을 0으로 만들어 주는 값. */
    baseAlong: 0,
    /**
     * 눌린 칸 안에서 누름이 떨어진 위치. 그 면 자신의 두 축을 따라, 몸통 로컬 단위로.
     * **클릭**이 방향을 잡는 데 쓰는 것이 이것이다. 읽을 이동량이 없으므로, 칸 중심에서의
     * 오프셋이 드래그였다면 갔을 방향을 대신한다. `endDrag` 참고.
     */
    faceOffsetA: 0,
    faceOffsetB: 0,
    angle: 0,
    omega: 0,
    /** NDC 이동 1단위당 라디안. 누를 때의 투영 크기에서 결정한다. */
    radsPerNdc: 6.4,
  };

  /**
   * 제스처 감도. 화면이 아니라 피사체를 기준으로 표현한다.
   *
   * 예전엔 로그인 프레이밍에서 보정한 고정 rad-per-NDC 상수였는데, 거기서는 큐브가 마침
   * 0.74 NDC를 차지한다. 오브젝트가 더 작은 칸에 들어가기 전까지는 괜찮다 — 그리고 그게
   * 이 모듈의 존재 이유 전부다 — NDC는 화면 공간이라서, 큐브를 줄이면 그 면을 가로지르는
   * 같은 드래그가 큐브의 더 적은 부분을 덮고, 따라서 같은 상수가 덜 돌린다. 오브젝트가
   * 작게 그려질수록 점점 돌리기 어려워지는데, 사용자는 그 이유를 짐작할 수 없다.
   *
   * 대신 투영된 실루엣을 기준으로 재면 둘 다 크기와 무관해진다. 큐브 반너비의 3분의 2를
   * 훑으면 그게 400px이든 90px이든 4분의 1 회전이다. 투영은 제스처마다 한 번, 누를 때
   * 가져온다 — 드래그 도중에 바뀌면 사용자의 손 아래에서 답이 바뀌는 것이기 때문이다.
   */
  const DRAG_QUARTER_SWEEP = 0.66;
  /** 투영된 전체 너비를 몇 번 훑어야 큐브 전체가 반 바퀴 도는가. */
  const SPIN_HALF_TURN_SWEEP = 1.25;

  const scratchCentre = new THREE.Vector3();
  const scratchEdge = new THREE.Vector3();
  const scratchRight = new THREE.Vector3();

  /** 주어진 카메라가 지금 보고 있는 큐브 실루엣의 절반(NDC). */
  const projectedHalfWidth = (camera: THREE.PerspectiveCamera): number => {
    spinRoot.getWorldPosition(scratchCentre);
    scratchRight.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(ASSEMBLY_HALF);
    scratchEdge.copy(scratchCentre).add(scratchRight);
    scratchCentre.project(camera);
    scratchEdge.project(camera);
    // 바닥을 깔아 둔다. 화면 밖에 있거나 퇴화한 피사체가 0으로 나누는 일이 없도록.
    return Math.max(0.02, Math.hypot(scratchEdge.x - scratchCentre.x, scratchEdge.y - scratchCentre.y));
  };

  /**
   * 측정된 각속도를 초당 얼마나 세게 평활화하는가.
   *
   * 던지기는 주어진 속도만큼만 좋고, 프레임 간 생차이는 대부분 노이즈다. 포인터가 마침
   * 안 움직인 8ms 프레임 하나가 0을 보고하는데, 하필 그 프레임에 놓으면 제스처 전체가
   * 버려진다. 순간값 쪽으로 18/s로 섞으면 대략 마지막 60ms가 남는데, 그게 사용자가
   * "놓을 때 내가 얼마나 빨랐나"로 여기는 구간이다.
   */
  const OMEGA_SMOOTHING = 18;

  // ── 큐브 전체 던지기 ─────────────────────────────────────────────────────────────
  //
  // 큐브를 빗나간 누름은 줄이 아니라 **오브젝트**를 붙잡는다. 제스처의 형태는 같다 — 손을
  // 따라오고 속도를 안고 간다 — 차이가 둘 있다. 붙을 자리가 없다는 것(구르는 큐브에는
  // 선호하는 방향이 없다), 그리고 몸통들이 한꺼번에 움직이지 않는다는 것.
  /**
   * 지금까지 끝난 모든 던지기를 합성한 것. 진행 중인 제스처의 각도는 이것 **위에** 적용되고
   * 끝날 때 여기로 접혀 들어간다. 그래서 두 번째 튕김이 큐브를 안착 요로 되돌리는 대신
   * 첫 번째가 남긴 자리에서 시작한다.
   */
  const spinAccum = new THREE.Quaternion();

  const spin = {
    active: false,
    grabbed: false,
    /**
     * 제스처가 시작될 때 기준이 된 카메라. `update`에는 자기 카메라가 없고 트랙볼 축은
     * 카메라 공간에서 만들어지는 것이라 누를 때 붙잡아 둔다 — 그리고 그게 붙잡기에 옳은
     * 프레임이기도 하다. 사용자가 뜻하는 축은 붙잡는 순간 자기 손 아래에 있던 축이지,
     * 큐브가 도는 동안 다시 유도된 축이 아니다.
     */
    camera: null as THREE.PerspectiveCamera | null,
    startX: 0,
    startY: 0,
    current: new THREE.Vector2(),
    /** 제스처가 확정한 화면상 방향과, 그것이 도는 월드 축. */
    dragDir: new THREE.Vector2(),
    axis: new THREE.Vector3(0, 1, 0),
    baseAlong: 0,
    /**
     * 손이 얹은 각도. 붙잡고 있는 단계 전용이다 — 여기에는 더 이상 비행 상태가 없다.
     * 던지기는 실제 층 회전 세 개로 격자에 넘겨지고 `rubik`이 비행시키기 때문이다.
     * `endDrag` 참고.
     */
    angle: 0,
    omega: 0,
    /**
     * 파도가 회전축의 어느 끝에서 시작하는가: +1 또는 −1.
     *
     * 누름이 큐브 중심에 대해 어디에 떨어졌는지에서 가져온다. 위쪽을 누르고 옆으로 훑으면
     * 윗줄이 먼저 가고, 아래를 누르면 아랫줄이 먼저 간다. 이게 없으면 사용자가 어디를
     * 붙잡았든 파도가 항상 축의 같은 방향으로 흐르는데, 이 효과를 미리 만들어 둔 것으로
     * 들통나게 만들 유일한 요소가 그것이다.
     */
    leadSign: 1,
    /** NDC 이동 1단위당 라디안. 누를 때의 투영 크기에서 결정한다. */
    radsPerNdc: 3.4,
  };

  /**
   * 던져진 큐브의 마찰(1/초) — 튕김이 4분의 1 회전 단위로 **얼마나 멀리** 가는지만 정한다.
   *
   * 줄의 마찰보다 낮고, 그래야 한다. 줄은 디텐트가 있는 기구이고 면은 작은 표적인 반면,
   * 이건 오브젝트 전체이고 제스처는 훑기다. 1.5에서 5 rad/s로 놓으면 4분의 1 회전 두 번을
   * 요구하고 세게 놓으면 여섯이나 여덟을 요구하므로, 큐브가 안착하기 전에 한두 바퀴 돌 수
   * 있다.
   */
  const SPIN_FRICTION = 1.5;

  /** 이 속도 아래로 놓으면 제스처는 툭 건드린 것이고, 큐브는 그냥 그 자리에 선다. */
  const SPIN_MIN_SPEED = 0.35;

  const scratchSpinAxis = new THREE.Vector3();
  const scratchLatticeAxis = new THREE.Vector3();
  const scratchSpinQuat = new THREE.Quaternion();
  const scratchInverse = new THREE.Quaternion();

  /** 격자 좌표계의 한 점을 정규화 장치 좌표로 투영한다. */
  const latticeToNdc = (
    point: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    out: THREE.Vector2,
  ): void => {
    scratchProject.copy(point);
    rubik.root.localToWorld(scratchProject);
    scratchProject.project(camera);
    out.set(scratchProject.x, scratchProject.y);
  };

  /** `centre`에서 봤을 때 격자 축 하나의 화면상 단위 방향. */
  const screenDirOf = (
    centre: THREE.Vector3,
    axis: SliceAxis,
    camera: THREE.PerspectiveCamera,
    out: THREE.Vector2,
  ): void => {
    scratchDragVec.copy(centre)[axis] += LATTICE_STEP;
    latticeToNdc(scratchDragVec, camera, scratchNdcTip);
    out.copy(scratchNdcTip).sub(scratchNdcOrigin);
    // 카메라를 거의 정면으로 가리키는 축은 투영하면 거의 0이 된다. 정규화하지 않고 두면
    // 우연히 모든 내적에서 이겨 버리는데, 0으로 만들면 그냥 진다.
    if (out.lengthSq() < 1e-8) out.set(0, 0);
    else out.normalize();
  };

  return {
    object3d,
    stats: { cubeletCount: rubik.cubeletCount },
    tuning: { lighting, stone, seam, shadow },

    beginDrag(ndc, camera) {
      drag.active = false;
      drag.grabbed = false;
      // 회전은 도는 동안 큐브를 소유한다. 예외가 하나 있는데, **이미** 돌고 있는 줄은
      // 4분의 1을 더 받는다. 그래서 큐브가 바쁠 때도 여기서 누름을 거절하지 않는다 —
      // `endDrag`가 그것을 돌고 있는 회전에 제안할 수 있도록 통과시키고, 다른 데 떨어졌으면
      // 거기서 거절한다.
      //
      // 드래그에는 별도 가드가 필요 없다. 무언가 도는 동안 `grabSlice`가 거절하고, 붙잡기
      // 블록이 그때 제스처를 놓아준다.

      raycaster.setFromCamera(ndc, camera);
      // 서브트리 전체가 아니라 몸통 자체에 대고 쏜다. `recursive`로 하면 몸통 안에 있는
      // 빛나는 코어에도 맞아서 엉뚱한 면을 보고한다.
      const hit = raycaster.intersectObjects(rubik.meshes as THREE.Object3D[], false)[0];
      if (!hit) {
        // 큐브를 빗나갔으니 제스처는 오브젝트 전체에 대한 것이다. 거절하지 않고 여기서
        // 받는 이유는 호출자가 포인터를 계속 넘겨주게 하기 위해서다. 로그인 칼럼 옆 빈
        // 캔버스를 누르는 것이야말로 이 페이지에서 누구나 제일 먼저 할 법한 일이다.
        // 손이 마지막으로 큐브에 얹은 것은 접어 넣으므로, 새 제스처는 큐브가 실제로 있는
        // 자리에서 측정된다. 아직 도는 파도는 **건드리지 않는다**. 그건 이제 격자의 것이고
        // 스스로 끝나며, 세 층이 도는 중에 큐브를 붙잡는 것은 그냥 그것들을 타는 일이다.
        if (spin.angle !== 0) {
          scratchSpinQuat.setFromAxisAngle(spin.axis, spin.angle);
          spinAccum.premultiply(scratchSpinQuat);
          spin.angle = 0;
        }

        spin.active = true;
        spin.grabbed = false;
        spin.camera = camera;
        spin.startX = ndc.x;
        spin.startY = ndc.y;
        spin.current.set(ndc.x, ndc.y);
        spin.radsPerNdc = Math.PI / (projectedHalfWidth(camera) * 2 * SPIN_HALF_TURN_SWEEP);
        return true;
      }

      // 모든 것을 격자 자신의 좌표계에서 결정한다. 줄이 정의된 좌표계가 그것이기 때문이다 —
      // 큐브는 표류와 안착 요와 포인터 기울임 아래에 있으므로, 월드 공간의 답은 그 셋
      // 모두만큼 틀린다.
      rubik.root.worldToLocal(scratchHit.copy(hit.point));
      hit.object.getWorldPosition(drag.centre);
      rubik.root.worldToLocal(drag.centre);

      // 어느 면이 눌렸는가, **부호까지** — 큐브 앞면을 오른쪽으로 미는 것과 뒷면을
      // 오른쪽으로 미는 것은 같은 줄을 반대로 돌리므로, "몸통의 어느 쪽인가"가 답의
      // 절반이다.
      scratchOffset.copy(scratchHit).sub(drag.centre);
      const faceName = dominantAxis(scratchOffset);
      drag.faceVec.set(0, 0, 0)[faceName] = Math.sign(scratchOffset[faceName]) || 1;

      // 그 면 **안에** 놓인 두 격자 축, 그리고 큐브의 현재 방향을 반영했을 때 각각이
      // 화면에서 가리키는 곳. 튕김을 축으로 바꾸는 것이 이것이다. 사용자는 화면 공간에서
      // 끌지만 뜻하는 건 오브젝트 위의 방향이고, 이번 프레임에 그 둘이 어떻게 대응하는지는
      // 투영만이 안다.
      const inPlane = AXIS_NAMES.filter((name) => name !== faceName);
      // 클릭 경로를 위해 남겨 둔다: 칸 **안에서의** 누름의 두 성분.
      drag.faceOffsetA = scratchOffset[inPlane[0]!];
      drag.faceOffsetB = scratchOffset[inPlane[1]!];
      drag.axisA = inPlane[0]!;
      drag.axisB = inPlane[1]!;
      latticeToNdc(drag.centre, camera, scratchNdcOrigin);
      screenDirOf(drag.centre, drag.axisA, camera, drag.screenA);
      screenDirOf(drag.centre, drag.axisB, camera, drag.screenB);

      drag.startX = ndc.x;
      drag.startY = ndc.y;
      drag.current.set(ndc.x, ndc.y);
      drag.radsPerNdc = Math.PI * 0.5 / (projectedHalfWidth(camera) * DRAG_QUARTER_SWEEP);
      drag.active = true;
      return true;
    },

    // 일부러 세터다. 포인터 이벤트는 자기 일정대로 도착하고 프레임 델타를 갖고 있지 않으며,
    // 던지기는 놓아진 속도만큼만 좋다 — 그래서 여기서는 제스처를 **샘플링**만 하고, 진짜
    // `dt`가 있고 렌더 프레임당 한 번만 평가되는 `update`에서 각도와 각속도로 바꾼다.
    dragTo(ndc) {
      if (spin.active) {
        spin.current.set(ndc.x, ndc.y);
        return spin.grabbed;
      }
      if (!drag.active) return false;
      drag.current.set(ndc.x, ndc.y);
      return drag.grabbed;
    },

    endDrag() {
      // 줄에 속도를 넘긴다. 이 뒤는 전부 회전 자신의 일이다 — 4분의 1 회전에 정확히
      // 내려앉는 감쇠율을 풀어내는 `throwSlice` 참고.
      if (drag.grabbed) {
        rubik.throwSlice(drag.omega);
        // 놓았을 때 아예 회전이 안 나오면 `throwSlice`가 그 자리에서 구워 버리므로, 뒤에
        // 물어보는 것이 실제로 무언가 움직일지 아는 방법이다. 출발한 4분의 1로 도로
        // 내려앉는 툭 건드림에는 섬광을 주지 않는다 — 아무 일도 안 일어났는데 불을 켜면
        // 다른 말을 하는 것이 된다.
        if (rubik.turning) turnCharge = 1;
      } else if (drag.active) {
        // ── 클릭 ──────────────────────────────────────────────────────────────────────
        //
        // 누름이 데드존을 넘지 못했으니 방향을 읽어 낼 이동량이 없다 — 그런데 **위치**는
        // 있고, 그걸로 충분하다. 클릭은 눌린 칸의 중심에서 누름이 실제로 떨어진 곳을 향한
        // 아주 짧은 드래그로 취급된다. 칸의 오른쪽을 클릭하면 오른쪽으로 민 것처럼 돌고,
        // 위쪽을 클릭하면 위로 민 것처럼 돈다.
        //
        // 이 규칙의 핵심은 그것이 두 번째 규칙이 아니라는 점이다. 축은 드래그가 쓰는 것과
        // 같은 외적으로 결정되고 회전은 같은 곡선을 비행하므로, 한 번 클릭해 본 사람은 이미
        // 드래그를 배운 것이고 드래그해 본 사람은 이미 클릭을 배운 것이다. 이전의
        // 클릭-회전은 **면**을 읽고 나머지를 유추했다 — 옆면이면 가로줄, 윗면이면 세로줄 —
        // 일관되긴 했지만 전혀 짐작할 수 없었다. 누름에서 의도를 담고 있던 유일한 부분을
        // 버렸기 때문이다.
        // 이미 도는 중이라면? 그러면 이 클릭이 뜻할 수 있는 건 "계속 가"뿐이고, 그것도
        // 지금 도는 그 줄에 떨어졌을 때만이다. `extendSlice`가 그걸 직접 검사한다 — 도는
        // 축 방향 좌표로 맞추는데, 그 축에 대한 회전은 그 좌표를 건드리지 않으므로 몸통들이
        // 비행 중이어도 답할 수 있다. 여기서 면을 결정하는 건 그렇지 못하다. 판들이 돌아가
        // 있어서 그 축이 더는 격자와 나란하지 않고, `dominantAxis`가 엉뚱한 축을 부른다.
        if (rubik.turning) {
          if (rubik.extendSlice(drag.centre)) turnCharge = 1;
          drag.active = false;
          drag.grabbed = false;
          drag.omega = 0;
          return;
        }

        const useA = Math.abs(drag.faceOffsetA) >= Math.abs(drag.faceOffsetB);
        const offset = useA ? drag.faceOffsetA : drag.faceOffsetB;

        // 정중앙은 방향이 없다는 뜻이고, 따라서 회전도 없다는 뜻이다. 칸 하나는
        // `CUBELET_EDGE` 너비인데, 그 가운데 5분의 1 안의 누름은 아무 데도 가리키고 있지
        // 않다. 그걸 대신 짐작해 주는 것이야말로 컨트롤이 예측 불가능해지는 경로다.
        if (Math.abs(offset) >= CUBELET_EDGE * CLICK_DEAD_ZONE) {
          scratchDragVec.set(0, 0, 0)[useA ? drag.axisA : drag.axisB] = Math.sign(offset);
          scratchAxisVec.copy(drag.faceVec).cross(scratchDragVec);
          const axisName = dominantAxis(scratchAxisVec);
          const direction = scratchAxisVec[axisName] >= 0 ? 1 : -1;
          if (rubik.grabSlice(drag.centre, axisName)) {
            rubik.throwSlice(direction * CLICK_OMEGA);
            turnCharge = 1;
          }
        }
      }
      drag.active = false;
      drag.grabbed = false;
      drag.omega = 0;

      if (spin.grabbed) {
        // 손이 큐브에 얹은 것은 그것이 도달한 자리에서 그대로 접혀 들어간다 — 아래의
        // 던지기는 그 위에 얹히는 격자 회전이지, 그것의 연장이 아니다.
        scratchSpinQuat.setFromAxisAngle(spin.axis, spin.angle);
        spinAccum.premultiply(scratchSpinQuat);
        spin.angle = 0;

        if (Math.abs(spin.omega) >= SPIN_MIN_SPEED) {
          // ── 파도 ───────────────────────────────────────────────────────────────────
          //
          // 던지기를 여기서 비행시키지 않고 격자에 넘긴다. 그러려면 격자의 언어로 표현해야
          // 한다: 이름으로 된 축, 4분의 1 회전의 정수 배, 그리고 축의 어느 끝이 먼저인가.
          //
          // 이것이 대체한 자유 버전은 그룹을 임의의 감쇠 각도로 돌리고 각 층을 그 각도의
          // 지연된 샘플로 렌더해서 어긋남을 흉내 냈다. 수렴했고 보기에도 맞았지만, 큐브를
          // 발견한 그대로 남겨 두었다. 같은 크기의 진짜 회전 셋은 더 나은 이유로 수렴한다 —
          // 서로 다른 시각에 출발한 같은 회전이기 때문이다 — 그리고 큐브는 받은 것을 간직한다.
          scratchInverse.copy(spinRoot.quaternion).invert();
          scratchLatticeAxis.copy(spin.axis).applyQuaternion(scratchInverse);

          const ax = Math.abs(scratchLatticeAxis.x);
          const ay = Math.abs(scratchLatticeAxis.y);
          const az = Math.abs(scratchLatticeAxis.z);
          const axisName: SliceAxis = ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
          // 월드 축에 대한 양의 회전은 둘이 반대 방향을 가리킬 때 `+axisName`에 대한 음의
          // 회전이므로, 부호를 투영에서 다시 꺼내야 한다.
          const axisSign = scratchLatticeAxis[axisName] >= 0 ? 1 : -1;
          const direction = Math.sign(spin.omega) * axisSign;

          // 줄이 쓰는 것과 같은 반올림이라 세게 튕길수록 멀리 간다. 최소 하나인 이유는,
          // 아무것도 아닌 것으로 계산되는 던지기는 무시당한 던지기이기 때문이다.
          const predicted = Math.abs(spin.omega) / SPIN_FRICTION;
          const quarters = Math.max(1, Math.round(predicted / (Math.PI * 0.5)));

          const started = rubik.spinLayers(
            axisName,
            quarters * direction,
            (spin.leadSign * axisSign >= 0 ? 1 : -1) as 1 | -1,
            Math.abs(spin.omega) * direction,
          );
          if (started) turnCharge = 1;
        }
      }
      spin.active = false;
      spin.grabbed = false;
      spin.omega = 0;
    },

    update(state, time, dt, pointer, dpr) {
      // ── 사용자의 붙잡기 ──────────────────────────────────────────────────────────
      //
      // 한 블록 안에 단계가 둘이다. 포인터가 방향을 뜻할 만큼 이동하기 전까지 제스처는
      // 아직 누름이다. 임계를 넘는 그 프레임에 축을 확정하고 줄을 점유하며, 그 뒤의 모든
      // 프레임은 각도를 1:1로 구동하면서 얼마나 빨리 구동되고 있는지를 측정한다.
      if (drag.active) {
        const dx = drag.current.x - drag.startX;
        const dy = drag.current.y - drag.startY;

        if (!drag.grabbed) {
          // 픽셀 두 개짜리 노이즈로 두 축 중 가까운 쪽을 확정해 버리면 사용자가 요청하지도
          // 않은 줄이 돌아간다. 그래서 데드존을 먼저 넘어야 한다.
          if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
            const alongA = dx * drag.screenA.x + dy * drag.screenA.y;
            const alongB = dx * drag.screenB.x + dy * drag.screenB.y;
            const useA = Math.abs(alongA) >= Math.abs(alongB);
            const dragName = useA ? drag.axisA : drag.axisB;
            drag.dragDir.copy(useA ? drag.screenA : drag.screenB);

            // 면을 누르고 방향으로 밀면, 움직이는 줄은 그 둘 모두에 수직인 줄이다 —
            // 부호까지 포함해 정확히 외적이다. 앞면(+Z)을 오른쪽으로 밀면 회전은 +Y에
            // 대한 것인데, +Y가 +Z를 +X로 데려가기 때문이다.
            //
            // 사용자가 마침 움직인 방향의 부호가 아니라 **양의** 단위 드래그 벡터로
            // 결정한다. 각도가 이제 연속이기 때문이다. 줄이 어느 쪽으로 가는지는 살아 있는
            // 변위의 부호가 실어 나르는데, 초기 방향까지 구워 넣으면 그게 제곱이 되어
            // 회전이 한쪽으로 고정된다.
            scratchDragVec.set(0, 0, 0)[dragName] = 1;
            scratchAxisVec.copy(drag.faceVec).cross(scratchDragVec);
            const axisName = dominantAxis(scratchAxisVec);
            drag.turnSign = scratchAxisVec[axisName] >= 0 ? 1 : -1;

            if (rubik.grabSlice(drag.centre, axisName)) {
              drag.grabbed = true;
              drag.angle = 0;
              drag.omega = 0;
              // 넘는 지점에서 각도를 0으로 맞춘다. 그래야 점유되는 순간 줄이 데드존 너비만큼
              // 튀지 않는다.
              drag.baseAlong = dx * drag.dragDir.x + dy * drag.dragDir.y;
            } else {
              drag.active = false;
            }
          }
        } else {
          const along = dx * drag.dragDir.x + dy * drag.dragDir.y;
          const next = drag.turnSign * (along - drag.baseAlong) * drag.radsPerNdc;
          const instant = dt > 1e-5 ? (next - drag.angle) / dt : 0;
          drag.omega = damp(drag.omega, instant, OMEGA_SMOOTHING, dt);
          drag.angle = next;
          rubik.dragSlice(next);
        }
      }

      // ── 큐브 전체를 붙잡은 상태 ──────────────────────────────────────────────────
      if (spin.active) {
        const dx = spin.current.x - spin.startX;
        const dy = spin.current.y - spin.startY;

        if (!spin.grabbed) {
          if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD && spin.camera) {
            spin.dragDir.set(dx, dy).normalize();
            // 트랙볼: 축은 드래그의 화면 평면 수직 방향이고, 카메라 공간에서 잡아 월드로
            // 가져온다. 오른쪽으로 끌면 가까운 면이 오른쪽으로 가는데 그건 화면 위쪽 축에
            // 대한 회전이고, 위로 끌면 위로 넘어가며 굴러가는데 그건 화면 왼쪽 축에 대한
            // 회전이다.
            scratchSpinAxis.set(-spin.dragDir.y, spin.dragDir.x, 0).applyQuaternion(spin.camera.quaternion);
            spin.axis.copy(scratchSpinAxis).normalize();

            // 그 축의 어느 끝에서 비틀림이 시작하는가. 누름 지점을 큐브 자신의 깊이 평면에
            // 올려놓고 중심에 대해 재므로, 가운데보다 위를 누르고 옆으로 훑으면 파도가
            // 윗줄에서부터 내려간다.
            spinRoot.getWorldPosition(scratchCentre);
            scratchEdge.set(spin.startX, spin.startY, 0.5).unproject(spin.camera).sub(scratchCentre);
            spin.leadSign = Math.sign(scratchEdge.dot(spin.axis)) || 1;
            spin.grabbed = true;
            spin.angle = 0;
            spin.omega = 0;
            spin.baseAlong = dx * spin.dragDir.x + dy * spin.dragDir.y;
          }
        } else {
          const along = dx * spin.dragDir.x + dy * spin.dragDir.y;
          const next = (along - spin.baseAlong) * spin.radsPerNdc;
          const instant = dt > 1e-5 ? (next - spin.angle) / dt : 0;
          spin.omega = damp(spin.omega, instant, OMEGA_SMOOTHING, dt);
          spin.angle = next;
        }
      }

      // ── 방향 ──────────────────────────────────────────────────────────────────────
      //
      // 출발점이 되는 자세 하나. 예전엔 오프닝 제스처를 위해 사람이 정한 "그리는" 자세로
      // 큐브를 그린 뒤 장면 사이의 빈 프레임에서 이 자세로 slerp했다. 제스처가 사라지면서
      // 돌아설 대상이 없어졌으므로, 안착 요는 그저 표류와 포인터 기울임과 모든 튕김을 재는
      // 기준일 뿐이다.
      scratchQuatA.copy(settledQuaternion);

      if (!state.reducedMotion) {
        // 끝도 없고 잡아당기는 것도 없는 표류.
        //
        // 고정된 속도로 `dt`를 적분할 뿐 다른 건 하지 않는다. 지금은 그게 전부이고, 그
        // 덕분에 성립하는 두 성질은 적어 둘 만하다. 오직 증가만 하므로 큐브가 역행할 수
        // 없다는 것, 그리고 속도가 무한히 커지는 `time`에 의존하지 않으므로 폭주할 수
        // 없다는 것.
        //
        // 예전엔 그 옆에 **안착**이 있었다. 영상이 특정 모서리를 잡는 비트에 도달하면
        // 각도를 다음 정수 회전 쪽으로 끌어당기는 것이었다. 이제 특정 모서리를 잡는 것이
        // 없고, 그걸 유지하는 비용은 하필 최악의 순간에 치러졌다. 로그인에 도착할 때
        // 포인터가 막 넘겨받는 시점에 안착이 큐브를 한 바퀴까지 쓸어 돌려서, 마우스를
        // 움직여 조종하려던 사람은 대신 큐브가 도는 것을 구경했다. 적분만 하는 표류에는
        // 풀어 놓을 태엽이 없다.
        tumbleAngle += (dt / TUMBLE_PERIOD) * TURN * state.tumble;

        scratchQuatB.setFromAxisAngle(scratchAxis, TUMBLE_DIRECTION * tumbleAngle);
        scratchQuatA.multiply(scratchQuatB);
      }

      // 사용자가 던진 모든 것을, 표류 위에 얹는다.
      //
      // 왼쪽에서 합성하는데, 축이 **월드** 축이기 때문이다 — 붙잡는 순간 카메라 자신의
      // 좌표계에서 만들어진 것이라, 표류에 실려 가는 게 아니라 표류의 결과에 작용해야 한다.
      // 표류는 그 아래에서 계속 돌아가고, 그게 던져진 큐브가 뚝 멈추는 대신 자기 유휴
      // 상태로 미끄러져 들어가게 만든다.
      if (spin.angle !== 0 || spinAccum.w !== 1) {
        scratchSpinQuat.setFromAxisAngle(spin.axis, spin.angle);
        scratchQuatA.premultiply(scratchSpinQuat.multiply(spinAccum));
      }

      // 포인터 추적: 커서 쪽으로 요/피치를 주고, 2초간 멈춰 있으면 가운데로 돌아온다.
      //
      // 멈춰 있음은 커서가 얼마나 빨리 움직이는지의 성질이지, 어디에 놓여 있는지의 성질이
      // 아니다. 위치로 검사하면 정중앙이 아닌 어디에 세워 둔 커서든 매 프레임 움직임으로
      // 읽히고, 가운데 복귀가 영영 발동하지 않는다.
      const dx = pointer.x - pointerLast.x;
      const dy = pointer.y - pointerLast.y;
      const speedSq = (dx * dx + dy * dy) / Math.max(dt * dt, 1e-6);
      pointerLast.copy(pointer);

      const wantsPointer = state.pointerAmount > 0.001 && !state.reducedMotion;
      if (wantsPointer) {
        if (speedSq > POINTER_IDLE_SPEED * POINTER_IDLE_SPEED) idleTime = 0;
        else idleTime += dt;
        const recentre = idleTime > POINTER_IDLE_DELAY ? 0 : 1;
        const targetX = pointer.x * POINTER_LIMIT * state.pointerAmount * recentre;
        const targetY = -pointer.y * POINTER_LIMIT * state.pointerAmount * recentre;
        pointerCurrent.x = damp(pointerCurrent.x, targetX, 5.2, dt);
        pointerCurrent.y = damp(pointerCurrent.y, targetY, 5.2, dt);
      } else {
        pointerCurrent.x = damp(pointerCurrent.x, 0, 5.2, dt);
        pointerCurrent.y = damp(pointerCurrent.y, 0, 5.2, dt);
      }

      if (Math.abs(pointerCurrent.x) > 1e-5 || Math.abs(pointerCurrent.y) > 1e-5) {
        scratchEuler.set(pointerCurrent.y, pointerCurrent.x, 0);
        scratchQuatB.setFromEuler(scratchEuler);
        scratchQuatA.premultiply(scratchQuatB);
      }
      spinRoot.quaternion.copy(scratchQuatA);

      // 느린 부유. 유물이 원점에 못 박힌 것처럼 느껴지지 않게.
      const bob = state.reducedMotion ? 0 : Math.sin(time * 0.42) * 0.05 * (1 - state.assembly * 0.6);
      spinRoot.position.y = bob;

      // 격자 자신의 좌표계를, 돌을 위해 알려 준다.
      //
      // 모든 몸통이 지오메트리 하나를 공유하므로, 이게 없으면 전부 같은 텍셀을 샘플링하고
      // 같은 돌 무늬를 입는다 — `STONE_VERT_BODY` 참고. 이 행렬의 역행렬이 몸통의 월드
      // 위치에서 표류와 포인터 기울임을 다시 나눠 내고 그 슬롯만 남기는데, 그게 스물일곱
      // 개 각각에 자기 패치를 준다.
      //
      // `updateWorldMatrix`는 서브트리가 아니라 조상만 훑는다. 여기 매달린 스물일곱 개
      // 몸통은 어차피 곧 렌더러가 변환할 것이고, 그걸 프레임당 두 번 하는 것이야말로 이
      // 코드가 절대 치르면 안 되는 비용이다.
      spinRoot.updateWorldMatrix(true, false);
      scratchSlotSpace.copy(spinRoot.matrixWorld).invert();
      stone.setSlotSpace(scratchSlotSpace);

      // ── 케이지에서 나와 도착하는 격자 ─────────────────────────────────────────────
      //
      // 알파 크로스페이드가 아니라 디더 discard다. 스물일곱 깊이에 있는 스물일곱 개 몸통은
      // 조립체가 유리로 읽히지 않고서는 블렌딩될 수 없는데, 그게 `REVEAL_PARS` 주석의
      // 전부다. `solidity`가 구동한다 — 예전에 이 같은 케이지에 대고 홀로 있던 유물을
      // 크로스페이드하던 바로 그 채널이고, 뜻하는 바도 그대로이며, 다만 도착하는 것이
      // 큐브 전체일 뿐이다.
      const latticeReveal = smootherstep(0, LATTICE_FADE_SHARE, state.solidity);
      stone.setReveal(latticeReveal);
      // 코어는 자기 판과 함께 도착한다. 솔리드로 두면 결 속에 매달린 불 켜진 상자로 읽힌다 —
      // 홈이야말로 코어가 **존재하는 이유**이고, 홈은 그 주변의 돌만큼 존재해야 한다.
      seam.setReveal(latticeReveal);

      seam.setFront(state.seamFront, state.seamFull);
      seam.setTime(time);

      // ── 충전 ──────────────────────────────────────────────────────────────────────
      //
      // 두 원천의 합이 아니라 최댓값으로 취한다. 회전이 아직 켜져 있는 동안 마침 정점에
      // 오른 너울이 빛을 회전 하나의 값어치 너머로 밀어 올리면, 둘을 구분할 수 없게 되기
      // 때문이다. 나가는 길에 감쇠를 걸어서 스파이크가 하강뿐 아니라 상승도 갖게 한다 —
      // 즉시 설정하면 컷으로 읽힌다.
      //
      // 등장에 게이트를 건다. 심에 불이 들어오기 전의 충전은 깊게 할 대상이 없고, 빈 홈에
      // 호박색 섬광만 도착하는 꼴이 되기 때문이다.
      //
      // 모션 축소는 **너울**을 잠재우고 회전은 남긴다. 너울은 할 말이 없는 분위기용
      // 애니메이션이고, 그 설정이 보여주지 말라고 요청하는 것이 정확히 그런 것이다. 반면
      // 회전의 충전은 누름이 무언가를 했다는 확인이며, 움직임을 줄여 달라고 한 사람에게서
      // 피드백을 걷어 가는 것은 편안함을 더 주는 게 아니라 정보를 덜 주는 일이다. 그리고
      // 그건 섬광이 아니라 느린 상승과 하강 한 번이다.
      turnCharge *= Math.exp(-CHARGE_DECAY * dt);
      const swell = state.reducedMotion
        ? 0
        : Math.pow(0.5 + 0.5 * Math.sin(time * SWELL_RATE), SWELL_SHARPNESS) * SWELL_PEAK;
      const wanted = Math.max(turnCharge, swell) * state.seamFull;
      charge = damp(charge, wanted, wanted > charge ? CHARGE_ATTACK : CHARGE_RELEASE, dt);
      seam.setCharge(charge);

      // ── 열 ────────────────────────────────────────────────────────────────────────
      //
      // `rubik.turning`에 대해 적분한다. "이 물건이 일하고 있는가"의 유일하게 정직한 척도가
      // 그것이다. 붙잡힌 줄, 비행 중인 줄, 파도의 세 층 전부를 아무도 따로 보고하지 않고도
      // 포괄한다. 양방향 모두 선형인데 — 지수 접근을 쓰면 빨강의 마지막 구간에 영영 닿지
      // 못하고, 이 효과가 도달해야 할 자리가 바로 그 범위의 꼭대기이기 때문이다.
      // 쉴 때의 너울과 달리 모션 축소에 게이트를 걸지 않는다. 열은 오직 사용자가 무언가를
      // 돌렸기 때문에만 존재하므로 자기 행동에 대한 피드백이고 — 움직임을 줄여 달라고 한
      // 사람도 여전히 큐브를 돌릴 수 있으며, 그게 작동하고 있다는 말은 여전히 들어야 한다.
      // 게다가 이건 움직이는 무언가가 아니라 수 초에 걸친 표류다.
      const towardHeat = rubik.turning ? dt / HEAT_UP_SECONDS : -dt / HEAT_DOWN_SECONDS;
      heat = Math.min(1, Math.max(0, heat + towardHeat));
      seam.setHeat(heat * state.seamFull);

      if (debug.enabled) {
        Reflect.set(window, '__charge', charge);
        Reflect.set(window, '__heat', heat);
      }

      rubik.update(state, dt);

      motes.update(state, time, dpr);
      shadow.update(state);
      lighting.setAwakening(state.awakening);
      // 씬에서 그림자를 드리우는 것은 아무것도 없다. 돌은 원래 안 드리웠고 — 몸통이 자기
      // 자신에 그림자를 지워 봐야 눈에 보이는 이득이 없다 — 드리우던 식재는 사라졌으므로,
      // 켜 두면 뎁스 패스가 매 프레임 빈 맵을 렌더하게 된다.
      lighting.setCastShadow(false);
    },

    applyTheme(theme) {
      stone.applyTheme(theme);
      seam.applyTheme(theme);
      motes.applyTheme(theme);
      shadow.applyTheme(theme);
      lighting.applyTheme(theme);
    },

    dispose() {
      shadow.dispose();
      motes.dispose();
      rubik.dispose();
      lighting.dispose();

      cubeletGeometry.dispose();
      cubeletSeamGeometry.dispose();
      stone.dispose();
      seam.dispose();

      object3d.removeFromParent();
    },
  };
}

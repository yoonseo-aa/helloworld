import * as THREE from 'three';
import { clamp01, lerp, smootherstep } from '../lib/math';
import type { SubjectState } from '../story/state';

/**
 * 3×3×3에 물려 있는 스물일곱 개의 유물 조각 — 이 페이지의 유일한 솔리드 오브젝트.
 *
 * ### 이들은 이동해서 오는 게 아니라, 거기 있음으로써 온다
 *
 * 예전엔 깊이에서 회전하며 어긋난 궤도로 날아 들어왔고, 나중에는 부서지고 있는 케이지 뒤로
 * 디더링되며 들어왔다. 둘 다 오프닝 제스처의 일이었고 그 오프닝은 이미지 시퀀스로 다시
 * 들어간다. 그래서 남은 건 등장이다. 격자는 아직 유령처럼 비칠 동안 몇 퍼센트 넓게 벌어져
 * 있다가 단단해지면서 닫히므로, 몸통들이 하나의 평평한 디졸브로 해석되는 대신 **함께**
 * 내려앉는다. 그중 나타남(reveal) 쪽 절반은 호출자의 몫이다 — 조각의 재질을 소유하는
 * `heroRelic.ts` 참고.
 *
 * ### 회전은 클릭이 아니라 던지기다
 *
 * 면을 누르고 끌면 손가락 아래의 줄이 포인터를 1:1로 따라온다. 놓으면 당신이 준 속도를
 * 안고 가다가 마찰로 감속하며 4분의 1 회전 위에 내려앉는다.
 *
 * 감속은 단일 지수함수이고, 그렇게 고른 것이 착지를 근사가 아니라 정확하게 만든다.
 * `ω' = -k·ω` 아래에서 ω₀로 놓았을 때 남은 **총** 이동량은 정확히 `ω₀/k`다 — 시뮬레이션이
 * 아니라 닫힌 식이다. 그래서 회전은 그 예측된 정지점에 가장 가까운 4분의 1 회전 배수를
 * 고른 다음 `k`를 역으로 풀어 거기에 착지할 수 있다: `k = ω₀ / (target − angle)`.
 * 지수함수 하나, 끝에 덧댄 스냅 단계 없음, 매 프레임 속도를 적분하며 생기는 표류 없음,
 * 그리고 각도를 누적이 아니라 경과 시간에서 계산하므로 어떤 프레임레이트에서도 같은 궤적.
 *
 * ### 큐브 전체를 던지기: 회전 하나가 아니라 회전 셋
 *
 * 큐브를 빗나간 튕김은 한 격자 축을 따라 **모든** 층을 같은 양만큼 같은 방향으로 돌리는데,
 * 각 층이 앞 층보다 조금씩 늦게 출발한다. 총 이동량이 전부 같으므로 결국 수렴한다.
 * 제스처는 큐브를 타고 내려가는 파도로 열리고, 전체가 하나의 몸으로 회전된 채 닫힌다.
 *
 * 이건 진짜 회전이고 — 세 개 — 변형이 아니다. 이전 버전은 흉내였다. 그룹을 자유로운 각도로
 * 돌리고 각 층을 그 각도의 **지연된 샘플**로 렌더해서 어긋나 보이게 했다. 그것도 수렴했지만
 * 아무것도 바꾸지 않았고, 남은 큐브는 시작한 큐브 그대로였다. 제대로 하는 데 드는 비용은
 * 하나다. 회전들이 동시에 돌 수 있어야 한다는 것 — 아래의 단일 피벗이 풀(pool)이 된 이유다.
 *
 * 각도는 격자 위에 머무르므로 여기서 무엇도 그리드를 벗어나지 않는다. 모든 회전은 4분의 1
 * 위에 내려앉아 구워지고, 다음 제스처의 줄 소속은 던지기가 몇 번 일어났든 깨끗한 좌표에서
 * 결정된다.
 */

export const ASSEMBLY_EDGE = 3.3;
export const LATTICE_STEP = 1.106;
export const CUBELET_EDGE = 1.088;

/**
 * 등장이 시작될 때 격자가 최종 크기보다 얼마나 더 벌어져 있는가.
 *
 * 똑같이 생긴 상자 스물일곱 개의 순수한 불투명도 크로스페이드는 솔리드가 생겨나는 게 아니라
 * 텍스처가 디졸브되는 것으로 읽힌다. 프레임 안에서 아무것도 움직이지 않으니 아무것도
 * 조립되지 않는 것이다. 모든 몸통을 자기 격자 벡터를 따라 이 비율만큼 밀어내고 단단해지면서
 * 그 틈을 닫으면 전체가 하나의 움직임을 갖는다.
 *
 * 작게 유지해야 한다. 0.055에서 제일 바깥 몸통이 0.086유닛 움직이는데, 자기 한 변의
 * 10분의 1도 안 되는 거리라 보이는 게 아니라 느껴진다.
 */
const CLOSING_SPREAD = 0.055;

/** 사용자가 요청한 회전이 어느 축으로 도는가. */
export type SliceAxis = 'x' | 'y' | 'z';

const AXIS_VECTORS: Readonly<Record<SliceAxis, THREE.Vector3>> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const QUARTER = Math.PI * 0.5;

/**
 * 명목 마찰(1/초) — 던져진 줄이 얼마나 빨리 속도를 잃는가.
 *
 * 던지기가 **어디서 멈출지 예측**하는 데만 쓰이고, 그게 어느 4분의 1 회전에 내려앉을지를
 * 고른다. 실제로 비행하는 감속률은 그 선택에서 역으로 풀어낸다. 그러니까 이 숫자는 주어진
 * 튕김이 얼마나 멀리 가는지만 정하고 그 외에는 아무것도 정하지 않는다. 3.4에서 12 rad/s로
 * 놓으면 3.5 rad — 4분의 1 회전 두 번 조금 넘게 — 를 예측하는데, 큐브 면을 가로지르는
 * 단호한 튕김이 만들어 내는 양이 대략 그 정도다.
 */
const FLICK_FRICTION = 3.4;

/**
 * 이 속도(rad/s) 아래로 놓으면 제스처가 던지기가 아니라 놓아두기로 읽힌다.
 *
 * 그 아래에서는 줄이 가장 가까운 4분의 1 회전에 내려앉는데, 그게 출발한 그 자리일 수도
 * 있다 — 면을 살짝 밀었다가 놓은 사람은 그 면을 돌려받아야 한다. 그 위에서는 진행 방향으로
 * 최소 4분의 1 회전이 보장되므로, 반올림이 아무리 얄궂게 떨어져도 튕김이 시작한 자리에서
 * 끝나는 일은 없다.
 */
const FLICK_MIN_SPEED = 1.6;

/**
 * 클릭 하나의 값어치(rad/s) — 예측 이동량이 정확히 4분의 1 회전이 되는 놓는 속도.
 *
 * 임의로 고른 게 아니라 마찰에 대해 표현했다. 그래서 클릭과 튕김이 숫자만 다른 같은
 * 사건이 된다. 클릭은 동일한 붙잡기 → 던지기 경로를 타고 동일한 곡선을 비행하며, 다만
 * 정확히 하나의 디텐트를 얻을 만큼의 속도를 받았을 뿐이다. 클릭에 특수 케이스인 구석이
 * 없고, 그래서 한 제스처를 익힌 사람은 이미 다른 하나도 익힌 것이 된다.
 */
export const CLICK_OMEGA = QUARTER * FLICK_FRICTION;

/**
 * 회전 지속 시간의 상·하한(초).
 *
 * 이제 회전은 **유한한** 운동이고, 억지로 끼워 맞춰지는 느낌이던 착지에 대한 해결의 전부가
 * 그것이다. 지수 감쇠는 결코 도착하지 않는다. 목표에 영원히 다가갈 뿐이라, 어떤 잔차에서
 * 회전이 끝났다고 선언하고 나머지를 한 프레임에 버려야 했다. 그 잔차가 아무리 작아도 —
 * 끝에서 0.7° — 속도가 두 프레임 사이에 무언가에서 아무것도 아닌 것으로 갔고, 불연속적으로
 * 멈추는 기구는 멎는 것이 아니라 딸깍 끼워지는 것으로 읽힌다.
 *
 * 하한은 격한 튕김이 세 프레임 만에 도착하는 것을 막고, 상한은 힘없는 튕김이 기어가는 것을
 * 막는다. 보통은 둘 다 닿지 않는다. 지속 시간은 놓는 속도에서 나온다.
 */
const MIN_DURATION = 0.35;
const MAX_DURATION = 2.6;

/**
 * 이어붙이기가 실어 나른다고 보는 최소 속도(rad/s).
 *
 * 회전이 거의 끝나가는 줄을 클릭하면 넘겨받는 속도가 거의 없고, **그** 속도에서 뽑은 지속
 * 시간은 한참 걸린다. 그래서 바닥을 깔아 뒀고, 덕분에 늦은 이어붙이기도 경쾌하게 출발한다.
 * 실제 속도보다 높게 바닥을 올려도 곡선의 시작 속도만 낮아질 뿐 단조성은 유지된다 —
 * `advance` 참고.
 */
const EXTEND_MIN_OMEGA = 3;

/** 몸통이 그 줄에 속한다고 보려면 격자 평면에 얼마나 가까이 있어야 하는가. */
const SLICE_TOLERANCE = LATTICE_STEP * 0.5;

/** 임의 축을 따르는 격자 평면들: 큐브 전체 던지기가 움직이게 하는 세 층. */
const LAYERS = [1, 0, -1] as const;

/**
 * 큐브 전체 던지기에서, 한 층이 출발하고 다음 층이 출발하기까지의 초.
 *
 * 이게 파도이고, 판단해야 할 기준은 시계가 아니라 **비율**이다. 이 값이 이웃 층 사이에
 * 벌리는 각도 차이는 대략 `delta·k·stagger`인데, 던지기가 k=5에서 k=2.3으로 느려졌을 때
 * 고정된 stagger가 파도를 보이게 하던 간격의 절반을 조용히 잃었다. 그래서 보상하려고
 * 올렸지만 끝까지는 아니다. 0.13이면 층들이 확실히 어긋나 보이면서도, 첫 층이 끝났는데
 * 마지막 층이 아직 서 있는 상태는 되지 않는다. 그렇게 되면 솔리드를 타고 가는 파도가
 * 아니라 우연히 같은 방향으로 도는 별개의 회전 세 개가 된다.
 */
const LAYER_STAGGER = 0.13;

/**
 * 회전 하나. 줄이 점유되는 순간부터 다시 구워져 들어가는 순간까지.
 *
 * 소속은 회전마다 살아 있는 위치에서 결정되고, 회전이 끝나면 루트로 구워진다. 이건 최적화가
 * 아니라 유일하게 동작하는 방식이다. X 회전 뒤에 윗줄에 있던 몸통은 다른 어딘가에 있으므로,
 * "방금 붙잡은 그 줄"에 어떤 조각이 속하는지는 **지금** 어디 있는지로만 답할 수 있다.
 */
interface SliceTurn {
  /** 이 회전이 돌리는 그룹. 풀에서 빌리고 구울 때 반납한다. */
  readonly pivot: THREE.Group;
  readonly axis: THREE.Vector3;
  /** 어느 격자 축인지(이름), 그리고 그 축의 어느 평면인지 — `extendSlice`가 이걸로 맞춘다. */
  readonly axisName: SliceAxis;
  readonly plane: number;
  readonly members: readonly THREE.Object3D[];
  /** 포인터가 아직 각도를 직접 소유하고 있는 동안 true. */
  held: boolean;
  /** 현재 구간이 시작될 때의 각도. */
  from: number;
  /** 이 구간의 부호 있는 이동량. */
  delta: number;
  /** 이 구간에 걸리는 초. `elapsed`가 여기 닿으면 회전이 끝난다 — 정확히. */
  duration: number;
  /**
   * 구간에 들어선 뒤 지난 초. 큐브 전체 던지기의 각 층은 **음수**로 시작하는데, 그게 파도의
   * 메커니즘 전부다. `elapsed = −0.26`인 층은 260ms 동안 가만히 있다가 먼저 떠난 층과
   * 정확히 같은 곡선을 비행한다.
   */
  elapsed: number;
  /** 살아 있는 각도(라디안). 매 프레임 쓰고, 회전을 구울 때 읽는다. */
  angle: number;
}

/**
 * 구간에 들어선 지 `elapsed`초일 때 회전이 어디에 있고 얼마나 빠른가.
 *
 * 곡선은 `delta · (1 − (1 − s)³)`이고, 임의로 고른 이징이 아니므로 어디서 나왔는지 적어
 * 둘 만하다. `p(0)=0`, `p(T)=delta`를 지나면서 시작 속도가 `ω₀`에 맞고 끝 속도가 0인 3차
 * 에르미트를 잡으면, 그 도함수는 `ω₀·T ≤ 3·delta`에서 단조이고, 임계 조건인
 * `T = 3·delta/ω₀`를 넣으면 다항식 전체가 위의 식으로 무너진다. 그 속도는
 * `3·delta·(1−s)²/T`다.
 *
 * 그래서 지속 시간 하나를 고르는 것으로 세 가지를 동시에 산다. 운동이 제스처가 놓아준 바로
 * 그 속도에서 **시작**하고, 정확히 0에서 **끝나고**, 정확히 목표에서 끝난다. 마무리에서
 * 버려지는 게 없는데, 남은 게 없기 때문이다 — 이것이 대체한 지수함수와의 차이 전부다.
 */
function advance(turn: SliceTurn): { angle: number; velocity: number } {
  const s = clamp01(turn.elapsed / turn.duration);
  const inv = 1 - s;
  return {
    angle: turn.from + turn.delta * (1 - inv * inv * inv),
    velocity: (3 * turn.delta * inv * inv) / turn.duration,
  };
}

/** `advance`가 `omega`로 시작해 `delta`에서 닫히게 만드는 지속 시간. */
function durationFor(delta: number, omega: number): number {
  const raw = (3 * Math.abs(delta)) / Math.max(Math.abs(omega), 1e-4);
  return Math.min(Math.max(raw, MIN_DURATION), MAX_DURATION);
}

interface Cubelet {
  readonly mesh: THREE.Object3D;
  readonly basePosition: THREE.Vector3;
  readonly baseQuaternion: THREE.Quaternion;
}

export interface Rubik {
  readonly root: THREE.Group;
  /** 모든 몸통. 호출자가 레이캐스트할 수 있도록. */
  readonly meshes: readonly THREE.Object3D[];
  readonly cubeletCount: number;
  /**
   * `point`(루트 로컬 좌표)를 지나는 줄을 `axis`에 대해 붙잡는다. 요청을 들어줄 수 없을 때
   * false를 반환한다 — 이미 무언가 돌고 있거나, 격자가 아직 도착 중일 때.
   */
  grabSlice(point: THREE.Vector3, axis: SliceAxis): boolean;
  /** 붙잡은 줄의 각도를 라디안으로 직접 구동한다. 붙잡은 줄이 없으면 아무 일도 안 한다. */
  dragSlice(angle: number): void;
  /** `omega` rad/s로 놓는다. 그 뒤 회전이 스스로 가장 가까운 4분의 1 회전까지 비행한다. */
  throwSlice(omega: number): void;
  /**
   * 이미 돌고 있는 줄에 `point`(루트 로컬)가 속한다면 4분의 1 회전을 하나 더 얹는다.
   * 맞는 게 없으면 false — 다른 줄이거나, 큐브 전체 파도이거나, 아직 포인터가 붙잡고 있는
   * 줄일 때.
   *
   * 지금 보고 있는 줄을 클릭하면 계속 돌아야 한다. 누구의 손에서든 이 물건은 그렇게 동작한다.
   * 회전이 **도는 중에도** 답할 수 있고 그 회전에 대해서만 답할 수 있는데, 회전은 모든
   * 몸통의 자기 축 방향 좌표를 건드리지 않기 때문이다. 몸통들은 비행 중이라 두 축에서는
   * 격자를 벗어나 있지만 세 번째 축에서는 정확히 출발한 자리에 있고, 이 함수가 검사해야
   * 하는 것이 바로 그 축이다.
   */
  extendSlice(point: THREE.Vector3): boolean;
  /**
   * `axis`를 따르는 세 층 전부를 같은 방향으로 `quarters`만큼 4분의 1 회전시킨다. 어긋나게
   * 출발시켜서 큐브가 파도로 열리고 하나의 강체 회전으로 닫히게 한다.
   *
   * `leadLayer`는 어느 끝이 먼저인지다. +1이면 `axis`의 양의 쪽 층에서, −1이면 음의 쪽에서
   * 시작한다. `omega`는 각 층 곡선의 속도를 정하므로, 세게 튕길수록 더 멀리 그리고 더 빨리
   * 간다.
   */
  spinLayers(axis: SliceAxis, quarters: number, leadLayer: 1 | -1, omega: number): boolean;
  /**
   * 무언가 붙잡혀 있거나 아직 비행 중인 동안 true — 따라서 큐브가 새 제스처를 받아들일지
   * 여부이기도 하다. 회전은 거의 다 온 시점이 아니라 **도착한** 시점에 끝난다 —
   * `advance` 참고.
   */
  readonly turning: boolean;
  update(state: SubjectState, dt: number): void;
  dispose(): void;
}

export function createRubik(makeCubelet: (index: number) => THREE.Object3D): Rubik {
  const root = new THREE.Group();
  root.name = 'rubik';

  const cubelets: Cubelet[] = [];

  let index = 0;
  for (let j = 1; j >= -1; j--) {
    for (let i = -1; i <= 1; i++) {
      for (let k = -1; k <= 1; k++) {
        // 가운데를 포함해 스물일곱 개다 — 코어란 그저 원점에 앉게 된 몸통일 뿐이고,
        // 나머지 스물여섯 개와 똑같은 방식으로 만든다.
        const mesh = makeCubelet(index);
        const basePosition = new THREE.Vector3(i * LATTICE_STEP, j * LATTICE_STEP, k * LATTICE_STEP);
        const baseQuaternion = new THREE.Quaternion();

        mesh.position.copy(basePosition);
        root.add(mesh);

        cubelets.push({ mesh, basePosition, baseQuaternion });

        index++;
      }
    }
  }

  /**
   * 피벗 세 개. 큐브 전체 던지기는 세 층이 동시에 돌아야 하기 때문이다.
   *
   * 회전이 사용자 자신의 것 하나뿐이던 시절에는 `slicePivot` 하나였고, 여기서 동시성이
   * 요구하는 비용의 전부가 이 풀이다. 회전들은 서로 경합하지 않는데, 어떤 축에 대한 회전은
   * 모든 몸통의 **그 축 방향** 좌표를 건드리지 않기 때문이다. 층 +1이 비행 중인 동안 층 0은
   * 아직 대기할 수 있고, 어느 쪽도 상대의 몸통을 뺏을 수 없다.
   */
  const pivots: THREE.Group[] = [];
  for (let i = 0; i < LAYERS.length; i++) {
    const pivot = new THREE.Group();
    pivot.name = `pivot-slice-${i}`;
    root.add(pivot);
    pivots.push(pivot);
  }

  const turns: SliceTurn[] = [];

  const bakeTurn = (turn: SliceTurn): void => {
    turn.pivot.updateMatrixWorld(true);
    // `attach`가 월드 변환을 각 몸통 자신의 변환으로 구워 넣는다. 그게 회전을 영구적으로
    // 만들고, 다음 회전이 평범한 위치에서 소속을 결정할 수 있게 한다.
    for (const mesh of turn.members) root.attach(mesh);
    turn.pivot.quaternion.identity();
    const at = turns.indexOf(turn);
    if (at >= 0) turns.splice(at, 1);
  };

  const bakeAll = (): void => {
    while (turns.length > 0) bakeTurn(turns[0]!);
  };

  /** 살아 있는 위치 기준으로, `axis` 방향 좌표가 `plane`에 있는 몸통들. */
  const membersOn = (axis: SliceAxis, plane: number): THREE.Object3D[] =>
    cubelets.filter((c) => Math.abs(c.mesh.position[axis] - plane) < SLICE_TOLERANCE).map((c) => c.mesh);

  const claim = (
    pivot: THREE.Group,
    axis: SliceAxis,
    plane: number,
    members: readonly THREE.Object3D[],
  ): SliceTurn => {
    pivot.quaternion.identity();
    pivot.updateMatrixWorld(true);
    for (const mesh of members) pivot.attach(mesh);
    const turn: SliceTurn = {
      pivot,
      axis: AXIS_VECTORS[axis],
      axisName: axis,
      plane,
      members,
      held: false,
      from: 0,
      delta: 0,
      duration: MIN_DURATION,
      elapsed: 0,
      angle: 0,
    };
    turns.push(turn);
    return turn;
  };

  return {
    root,
    meshes: cubelets.map((c) => c.mesh),
    cubeletCount: cubelets.length,

    get turning() {
      return turns.length > 0;
    },

    grabSlice(point, axis) {
      // 한 번에 제스처 하나. 몸통의 자세를 바깥에서 다시 쓰는 것은 무엇이든 — 두 번째
      // 회전이든, `update`의 슬롯 자세 쓰기든 — 굽기와 싸운다.
      if (turns.length > 0) return false;

      const plane = point[axis];
      const members = membersOn(axis, plane);
      if (members.length === 0) return false;

      claim(pivots[0]!, axis, plane, members).held = true;
      return true;
    },

    dragSlice(angle) {
      const turn = turns[0];
      if (!turn || !turn.held) return;
      turn.angle = angle;
      turn.pivot.quaternion.setFromAxisAngle(turn.axis, angle);
    },

    throwSlice(omega) {
      const turn = turns[0];
      if (!turn || !turn.held) return;

      const angle = turn.angle;
      // 놓았을 때 얼마나 멀리 가는가. 그게 디텐트를 고른다. 여전히 마찰 모델이지만 —
      // "얼마나 멀리"에만 답하고, 거기까지 가는 **모양**은 `advance`가 정한다.
      const predicted = angle + omega / FLICK_FRICTION;
      let quarters = Math.round(predicted / QUARTER);

      if (Math.abs(omega) >= FLICK_MIN_SPEED) {
        // 튕김은 회전해 달라는 요청이므로, 반올림이 뭐라 하든 하나는 받는다.
        const direction = Math.sign(omega);
        const least = Math.round(angle / QUARTER) + direction;
        quarters = direction > 0 ? Math.max(quarters, least) : Math.min(quarters, least);
      }

      const delta = quarters * QUARTER - angle;
      if (Math.abs(delta) < 1e-4) {
        turn.pivot.quaternion.setFromAxisAngle(turn.axis, quarters * QUARTER);
        bakeTurn(turn);
        return;
      }

      turn.held = false;
      turn.from = angle;
      turn.delta = delta;
      turn.duration = durationFor(delta, omega);
      turn.elapsed = 0;
    },

    extendSlice(point) {
      // 단일 줄에 대해서만, 그것도 혼자 비행 중인 줄에 대해서만. 큐브 전체 파도는 한 몸으로
      // 움직이는 회전 세 개라 얹을 "줄"이 없고, 붙잡힌 줄은 포인터의 것인데 그 포인터는
      // 요청하고 있지 않다.
      if (turns.length !== 1) return false;
      const turn = turns[0]!;
      if (turn.held) return false;
      if (Math.abs(point[turn.axisName] - turn.plane) >= SLICE_TOLERANCE) return false;

      const { angle, velocity } = advance(turn);
      const target = turn.from + turn.delta + Math.sign(turn.delta) * QUARTER;
      const delta = target - angle;

      // 이미 갖고 있는 속도를 새 구간으로 실어 나른다. 그래야 추가된 4분의 1 회전이 줄을
      // 다시 시작하는 것처럼 보이지 않고 이어 붙는다.
      turn.from = angle;
      turn.delta = delta;
      turn.duration = durationFor(delta, Math.max(Math.abs(velocity), EXTEND_MIN_OMEGA));
      turn.elapsed = 0;
      return true;
    },

    spinLayers(axis, quarters, leadLayer, omega) {
      if (turns.length > 0 || quarters === 0) return false;

      const delta = quarters * QUARTER;
      const duration = durationFor(delta, omega);

      for (let i = 0; i < LAYERS.length; i++) {
        const layer = LAYERS[i]!;
        const plane = layer * LATTICE_STEP;
        const members = membersOn(axis, plane);
        if (members.length === 0) continue;

        const turn = claim(pivots[i]!, axis, plane, members);
        turn.from = 0;
        turn.delta = delta;
        turn.duration = duration;
        // 어긋난 출발, 그리고 파도의 전부. `leadLayer`가 축의 어느 끝이 0인지 정하고,
        // 나머지 둘은 순서대로 자기 차례를 기다린다.
        const order = leadLayer > 0 ? 1 - layer : layer + 1;
        turn.elapsed = -order * LAYER_STAGGER;
      }

      return turns.length > 0;
    },

    update(state, dt) {
      const assembly = state.assembly;
      const arriving = assembly > 0.002;

      // ── 비행 중인 회전들 ──────────────────────────────────────────────────────────
      //
      // 끝난 회전이 스스로 목록에서 빠지므로 뒤에서부터 순회한다.
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i]!;
        if (turn.held) continue;

        turn.elapsed += dt;
        // 아직 파도에서 자기 차례를 기다리는 중.
        if (turn.elapsed <= 0) continue;

        turn.angle = advance(turn).angle;
        turn.pivot.quaternion.setFromAxisAngle(turn.axis, turn.angle);

        // 도착은 임계값이 아니라 사실이다. `advance`는 `s = 1`에서 잘리는데, 거기서 각도는
        // 정확히 `from + delta`이고 속도는 정확히 0이다 — 그래서 스냅할 것도 반올림할 것도
        // 없고, 굽기는 구성상 깨끗한 격자 좌표를 보게 된다.
        if (turn.elapsed >= turn.duration) bakeTurn(turn);
      }

      // 스물일곱 개 전부에 대해 값 하나. 등장은 한 번 일어나므로 격자도 한 번 넘겨받는다.
      // **보이는 것**에 몸통별 시차를 주는 건 다른 옷을 입은 행렬일 뿐이고, 등장은 겨우
      // 1초 남짓이라 스물일곱으로 쪼개면 볼 것이 남지 않는다.
      const presence = clamp01(assembly);
      const closing = state.reducedMotion ? presence : smootherstep(0, 1, presence);
      // 각 몸통이 단단해지면서 자기 중심을 향해 수축한다.
      const bodyScale = lerp(0.86, 1, closing);
      const spread = state.reducedMotion ? 1 : lerp(1 + CLOSING_SPREAD, 1, closing);

      /**
       * 등장이 아직 몸통들의 자세를 소유하고 있는가.
       *
       * 등장은 매 프레임 모든 조각의 슬롯 자세를 쓰는데, 격자가 도착하는 동안에는 맞고
       * 사용자가 줄을 돌릴 수 있게 되는 순간부터는 틀리다 — 그 쓰기가 바로 다음 프레임에
       * 굽기를 되돌려서 큐브가 맞춰진 상태로 되튄다. 도착이 끝나면 `spread`와 `bodyScale`이
       * 둘 다 최종값에 닿아서 이 쓰기가 할 말이 없어지므로, 쓰기를 멈추고 구워진 변환이
       * 그대로 선다.
       */
      const posing = closing < 0.999;
      // 슬롯 자세가 밑에서 다시 쓰이면 회전은 살아남을 수 없으므로, 싸우는 대신 놓아준다.
      // 실제로는 등장이 다시 시작될 때만 발동한다.
      if (posing && turns.length > 0) bakeAll();

      for (const cubelet of cubelets) {
        const mesh = cubelet.mesh;
        mesh.visible = arriving;
        if (!arriving || !posing) continue;

        mesh.position.copy(cubelet.basePosition).multiplyScalar(spread);
        mesh.quaternion.copy(cubelet.baseQuaternion);
        mesh.scale.setScalar(bodyScale);
      }
    },

    dispose() {
      for (const cubelet of cubelets) cubelet.mesh.removeFromParent();
      cubelets.length = 0;
      root.removeFromParent();
    },
  };
}

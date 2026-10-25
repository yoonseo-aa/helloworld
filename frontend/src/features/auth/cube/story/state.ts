import { clamp01, focalToFov, smootherstep, smoothstep } from '../lib/math';

/**
 * 피사체가 지금 무엇을 하고 있는지를, 그냥 데이터 계약으로 표현한 것.
 *
 * 이 파일은 원래 `beats.ts`였다. 장면 경계가 다섯 개였다가 두 개가 됐고, 비트마다 카메라
 * 키프레임과 열몇 개의 애니메이션 채널이 있었으며 전부 스크롤 위치에서 계산됐다. 오프닝
 * 제스처와 그 뒤 전부가 이미지 시퀀스로 다시 들어가므로, 남은 구도는 하나 — 로그인 패널
 * 뒤의 큐브 — 이고 스크럽할 것이 없다.
 *
 * 살아남은 건 **등장**과 **쉼**이다. 큐브가 디더링으로 나타나고, 심에 불이 들어오고,
 * 그 다음부터는 그냥 앉아서 돌릴 수 있는 상태로 있는다. 채널을 리터럴로 뭉개지 않고
 * 남겨 둔 이유는 재질과 오브젝트가 이미 그걸 읽고 있고, 등장이 로그인 화면이 여전히
 * 원하는 유일한 연출 타이밍이기 때문이다 — 도착했을 때 이미 완성돼 있는 오브젝트는
 * 자기가 어떻게 만들어졌는지 아무 말도 하지 않는다.
 *
 * 상태는 진행도가 아니라 **경과 초**로 구동된다. 차이는 그게 전부다: 이제 도달해야 할
 * 외부 위치가 없고, 씬이 시작할 때 같이 시작해서 2초쯤 뒤엔 의미가 없어지는 시계만 있다.
 */
export interface SubjectState {
  /**
   * 질량이 얼마나 존재하는가 — 0이면 아직 없는 스물일곱 개의 몸통, 1이면 닫힌 큐브.
   * `relicCube.ts`의 디더링 등장과, 그림자를 드리울 무언가가 있는지 알아야 하는 모든 것을
   * 구동한다.
   */
  assembly: number;
  /** 같은 도착을, 그걸 읽는 재질 쪽 이름으로 부른 것. */
  solidity: number;
  /** 큐브가 얼마나 돌고 싶어 하는가. 표류의 속도를 결정하고 각도는 건드리지 않는다. */
  tumble: number;
  /** 포인터를 따라 기우는 정도를 얼마나 통과시킬지. */
  pointerAmount: number;
  /** 코어를 따라 달리는 빛의 전선(front)과, 그 다음 코어를 채우는 정도. */
  seamFront: number;
  seamFull: number;
  /** 공기 중의 먼지. */
  pollen: number;
  awakening: number;
  shadowAmount: number;
  subjectRadius: number;
  reducedMotion: boolean;
}

/**
 * 유일한 구도. 격자의 안착 방향(`relicCube.ts`의 `RELIC_SETTLED_YAW`)에 맞춰 잡았기 때문에
 * 프레이밍이 실제 모서리 위에 떨어진다: 40mm로 뒤로 물러나서, 큐브는 왼쪽, 로그인 패널은
 * 오른쪽, 접지 그림자가 읽히도록 아래에 바닥을 둔다.
 */
export const CAMERA = {
  position: [3.05, 2.5, 12.6] as const,
  target: [0.0, 0.12, 0.0] as const,
  focalMm: 40,
  /** 구도 오프셋(뷰포트 비율). +x는 피사체를 왼쪽으로, +y는 아래로 옮긴다. */
  offset: [0.26, 0.035] as const,
  /** 세로 화면은 잘라내지 않고 다시 잡는다 — 뒤로 물러나면서 화각을 넓힌다. */
  mobile: { distanceScale: 1.44, offset: [0.0, -0.27] as const, focalScale: 0.9 },
};

export const CAMERA_FOV = focalToFov(CAMERA.focalMm);

/** 조립된 3×3×3(한 변 3.3)의 반대각선 — 여기 있는 유일한 피사체다. */
const SUBJECT_RADIUS = 1.65 * Math.SQRT2 * 1.2247;

/**
 * 등장. 첫 프레임부터의 초 단위다.
 *
 * 일부러 짧다. 여기는 로그인 화면이고, 읽는 사람은 타이핑하러 왔다. 이메일 칸으로 손이
 * 가는 시간보다 오래 걸리는 도착은 방해다. 2초 남짓이면 전부 — 몸통, 심, 표류, 포인터 —
 * 가 페이지가 아직 자리를 잡는 시간 안에 들어가고, 그 뒤는 전부 쉬는 상태다.
 */
const ENTRANCE = {
  /** 몸통이 디더링으로 들어온다. */
  assembly: [0.0, 1.15] as const,
  /** 빛의 전선이 코어를 가로지른 뒤 채운다. */
  seamFront: [0.35, 1.5] as const,
  seamFull: [1.0, 2.05] as const,
  /** 표류와 포인터가 마지막이다. 단단해지기 전에는 아무것도 움직이지 않도록. */
  tumble: [1.2, 2.0] as const,
  pointer: [1.4, 2.2] as const,
};

export function createSubjectState(): SubjectState {
  return {
    assembly: 0,
    solidity: 0,
    tumble: 0,
    pointerAmount: 0,
    seamFront: 0,
    seamFull: 0,
    pollen: 0,
    awakening: 0,
    shadowAmount: 0,
    subjectRadius: SUBJECT_RADIUS,
    reducedMotion: false,
  };
}

/**
 * 상태를 제자리에서 쓴다 — 매 프레임 도는 함수라 할당하지 않는다.
 *
 * 모션 축소 설정에서는 등장을 짧게 줄이는 게 아니라 아예 건너뛴다. 디더링 조립은 그
 * 설정이 보여주지 말라고 요청하는 바로 그런 종류의 것이고, 거기에 정보가 없기 때문이다 —
 * 어느 쪽이든 큐브는 같은 큐브다.
 */
export function evaluateSubject(state: SubjectState, elapsed: number, reducedMotion: boolean): void {
  state.reducedMotion = reducedMotion;

  if (reducedMotion) {
    state.assembly = 1;
    state.solidity = 1;
    state.tumble = 0;
    state.pointerAmount = 0;
    state.seamFront = 1;
    state.seamFull = 1;
  } else {
    state.solidity = smootherstep(ENTRANCE.assembly[0], ENTRANCE.assembly[1], elapsed);
    state.assembly = state.solidity;
    state.seamFront = smootherstep(ENTRANCE.seamFront[0], ENTRANCE.seamFront[1], elapsed);
    state.seamFull = smootherstep(ENTRANCE.seamFull[0], ENTRANCE.seamFull[1], elapsed);
    state.tumble = smoothstep(ENTRANCE.tumble[0], ENTRANCE.tumble[1], elapsed);
    state.pointerAmount = smoothstep(ENTRANCE.pointer[0], ENTRANCE.pointer[1], elapsed);
  }

  state.awakening = Math.max(state.seamFront * 0.55, state.seamFull * 0.85);
  // 성기게. 먼지는 오브젝트 주변의 공기이지 날씨가 아니다 — 로그인 카피가 그 옆에 앉으므로
  // 화면에서 제일 잘 읽히는 것은 카피여야 한다.
  state.pollen = 0;
  state.shadowAmount = state.assembly * 0.9;
  state.subjectRadius = SUBJECT_RADIUS * Math.max(0.55, state.assembly);
  state.assembly = clamp01(state.assembly);
}

import * as THREE from 'three';

/**
 * 큐브가 읽는 모든 색과 조명 값. 그 외에는 아무것도 없다.
 *
 * 예전에는 페이지와 하나의 `tokens.ts`를 공유했고, 이건 그중 3D 절반이다. 이 분리가 모듈
 * 경계의 핵심이다 — 호스트 애플리케이션에는 자기 디자인 시스템이 있고(지금 쓰는 쪽은
 * Tailwind다), 큐브 하나 그리자고 이 프로젝트의 `--custom-property` 이름이나 빌드타임
 * `<head>` 주입기, `ThemeController`까지 받아들이게 만들면 안 된다. 받아들여야 하는 건
 * 문자열 하나, `'dark'` 아니면 `'light'`다.
 *
 * 표 자체는 그대로이고, 그중 제일 중요한 배치도 그대로다: 조명 리그는 **한 번만** 쓰고
 * 두 테마가 공유한다. 예전에는 밤 리그와 낮 리그 두 벌이었는데, 비용은 표가 아니라
 * 튜닝이었다 — 3점 조명, 블룸 강도와 임계값, 톤매핑 노출, 돌 알베도, 먼지 색을 전부 두 번
 * 판단해야 했고, 안 그러면 아무도 안 보는 쪽이 조용히 나빠졌다. 오브젝트는 한 가지 방식으로
 * 조명되고 테마 전환은 거기에 손을 못 댄다.
 *
 * 유일한 예외가 배경이다. 페이지의 배경인데 마침 렌더러가 그리고 있을 뿐이다. `BACKDROPS` 참고.
 */

/** 색은 hex 문자열, 나머지는 스칼라 — 표 안에 `three` 타입은 없다. */
export interface CubeTokens {
  readonly bgCenter: string;
  readonly bgEdge: string;
  readonly stoneBase: string;
  readonly stoneShadow: string;
  readonly stoneLit: string;
  /**
   * 코어의 발광하지 않는 본체 색. 코어는 발광체라서 리그의 빛이 닿지 않는데, 자기 색이
   * 없으면 새까맣게 렌더되고 홈이 "안에 뭔가 단단한 게 있는 틈"이 아니라 유물을 뚫고
   * 지나가는 구멍으로 읽힌다.
   */
  readonly coreDormant: string;
  /**
   * 정원의 색들. 남겨는 뒀지만 쓰이지 않는다.
   *
   * 흙바닥·이끼·풀·데이지는 그것들을 심던 장면과 함께 삭제됐다 — `heroRelic.ts` 맨 위 주석
   * 참고. 표에 남아 있는 이유는 `ResolvedTheme`이 모든 모듈이 구조 분해해서 쓰는 고정된
   * 형태의 레코드이고, 죽은 hex 문자열 열한 개가 시작할 때 `THREE.Color` 하나씩만 잡아먹기
   * 때문이다. 지우는 건 절약이 아니라 정리이고, 그러자고 파일 여섯 개를 건드려야 한다.
   */
  readonly soilDry: string;
  readonly soilPale: string;
  readonly soilCrest: string;
  readonly mossDeep: string;
  readonly mossMid: string;
  readonly grassTip: string;
  readonly daisyPetal: string;
  readonly daisyCenter: string;
  readonly seam: string;
  readonly seamHi: string;
  readonly ember: string;
  /**
   * 큐브를 한참 굴렸을 때 심이 가는 색 — `heroRelic.ts`의 열(heat) 채널 참고.
   *
   * 빨강인 이유는 뜨거운 금속이 실제로 그러기 때문이 아니라, 기계가 뜨거워진다는 게
   * 사람에게 그렇게 읽히기 때문이다. 실제 흑체복사는 반대 방향으로 간다 — 빨강에서
   * 주황을 지나 흰색으로 — 그걸 따르면 심이 지금 색인 호박색에서 **이미 클리핑된 쪽으로**
   * 가게 되고, 그건 눈에 아무 변화도 안 준다는 뜻이다. 여기서는 관습이 이기고, 두 번
   * 이긴다: 빨강은 쉬고 있을 때의 호박색이 갈 수 있는 유일한 방향이면서, 그 호박색과
   * 절대 혼동되지 않는 방향이다.
   */
  readonly seamOverheat: string;

  readonly envIntensity: number;
  readonly keyIntensity: number;
  readonly keyColor: string;
  readonly rimIntensity: number;
  readonly rimColor: string;
  readonly fillIntensity: number;
  readonly fillColor: string;

  readonly seamEmissive: number;
  readonly seamMetalness: number;
  readonly seamRoughness: number;

  readonly bloomStrength: number;
  readonly bloomThreshold: number;
  readonly bloomRadius: number;

  readonly shadowOpacity: number;
  readonly exposure: number;
  /**
   * 틈새 차폐(AO) 가중치. AO는 간접광에 작용하므로 혼자 보지 말고 `envIntensity`와 같이
   * 놓고 판단한다.
   */
  readonly aoStrength: number;

  /** 1 = 밝게 더해지는 먼지(밤), 0 = 어두운 꽃가루 알갱이(낮). */
  readonly moteAdditive: number;
  readonly moteOpacity: number;
  readonly moteCountScale: number;
  readonly moteColor: string;

  /** 손 평면 음영. 손도 사라졌다 — 위의 정원 색 주석 참고. */
  readonly handBase: number;
  readonly handWarm: number;
}

export type CubeThemeName = 'dark' | 'light';

export const CUBE_THEME_NAMES: readonly CubeThemeName[] = ['dark', 'light'];

/** 3D 계층이 읽는 모든 값. 한 번만 쓰고 모든 테마가 공유한다. */
export const CUBE_TOKENS: CubeTokens = {
  bgCenter: '#08070A',
  bgEdge: '#05040A',
  // 중성 회색. 원래 브리프의 값은 따뜻한 회색이었는데, 따뜻한 키 라이트와 호박색 코어에
  // 곱해지면서 갈색이 됐다. 유물은 창백한 돌로 읽혀야 한다.
  stoneBase: '#B5B3AE',
  stoneShadow: '#7E7C78',
  stoneLit: '#E0DED8',
  coreDormant: '#4A4842',
  soilDry: '#E4E0D8',
  soilPale: '#CFCCC5',
  soilCrest: '#FFEBD2',
  mossDeep: '#4E5C33',
  mossMid: '#7E8F45',
  grassTip: '#A9BB6A',
  daisyPetal: '#F2EEE2',
  daisyCenter: '#E2A73C',
  seam: '#F5B95A',
  seamHi: '#FFD79A',
  ember: '#C8792A',
  // 순수한 빨강이 아니라 적주황. 초록이 아직 남아 있어서 후광이 경고등이 아니라 **열**로
  // 읽히고, 파랑이 빨강의 100분의 1이라 뿌옇게 번지고 검정 위에 던져져도 색이 살아남는다.
  seamOverheat: '#E0431A',

  envIntensity: 0.13,
  keyIntensity: 2.7,
  keyColor: '#FFFCF8',
  rimIntensity: 1.85,
  // 추측이 아니라 측정값이다. 리그 조명을 전부 흰색으로 강제하면 돌이 중성인
  // rgb(159,158,156)으로 렌더되는데, 이 조명 하나만 중성화해도 R-B 차이가 46에서 3.6으로
  // 떨어진다. 황갈색을 잡으려던 시도는 전부 하늘 프로브와 알베도를 뒤졌지만, 범인은
  // 내내 여기 있었다 — 유물 뒤에 머무르지 않고 카메라가 실제로 보는 면을 스치도록
  // 2.2까지 밝힌 이 조명이다.
  rimColor: '#FFFAF4',
  fillIntensity: 0.17,
  fillColor: '#2A2E3A',

  seamEmissive: 1.0,
  seamMetalness: 0.15,
  seamRoughness: 0.5,

  bloomStrength: 0.55,
  bloomThreshold: 0.85,
  bloomRadius: 0.3,

  shadowOpacity: 0.42,
  exposure: 1.05,
  aoStrength: 1.0,

  moteAdditive: 1,
  moteOpacity: 0.85,
  moteCountScale: 1,
  moteColor: '#FFC97A',

  handBase: 0.62,
  handWarm: 1.0,
};

/**
 * 테마가 건드릴 수 있는 유일한 3D 값.
 *
 * 오브젝트를 어떻게 조명하느냐의 일부가 아니라 그 **뒤에 있는 배경**이고, 이 모듈이 그걸
 * CSS에 맡기지 않고 렌더러로 그리고 있을 뿐이다. 검은 캔버스 위에 흰 페이지는 라이트
 * 모드가 아니므로, 이만큼은 움직여야 한다.
 *
 * `#FFFFFF`가 파이프라인을 그대로 통과하는 건 배경 재질이 `toneMapped: false`이기
 * 때문이다 — `environment.ts` 참고. ACES를 거치면 0.85 근처로 떨어져서 흰 페이지 안에
 * 캔버스만 눈에 띄게 회색으로 앉는다.
 *
 * 자기 배경을 직접 그리는 호스트는 배경을 통째로 끄면 되고(`backdrop: false`), 그러면 이
 * 값들은 읽히지 않고 캔버스가 뒤에 있는 것 위에 합성된다.
 */
export const CUBE_BACKDROPS: Readonly<Record<CubeThemeName, { bgCenter: string; bgEdge: string }>> = {
  dark: { bgCenter: '#08070A', bgEdge: '#05040A' },
  light: { bgCenter: '#FFFFFF', bgEdge: '#FFFFFF' },
};

const THREE_COLOR_KEYS = [
  'bgCenter',
  'bgEdge',
  'stoneBase',
  'stoneShadow',
  'stoneLit',
  'coreDormant',
  'soilDry',
  'soilPale',
  'soilCrest',
  'mossDeep',
  'mossMid',
  'grassTip',
  'daisyPetal',
  'daisyCenter',
  'seam',
  'seamHi',
  'ember',
  'seamOverheat',
  'keyColor',
  'rimColor',
  'fillColor',
  'moteColor',
] as const;

const THREE_SCALAR_KEYS = [
  'envIntensity',
  'keyIntensity',
  'rimIntensity',
  'fillIntensity',
  'seamEmissive',
  'seamMetalness',
  'seamRoughness',
  'bloomStrength',
  'bloomThreshold',
  'bloomRadius',
  'shadowOpacity',
  'exposure',
  'aoStrength',
  'moteAdditive',
  'moteOpacity',
  'moteCountScale',
  'handBase',
  'handWarm',
] as const;

type ThreeColorKey = (typeof THREE_COLOR_KEYS)[number];
type ThreeScalarKey = (typeof THREE_SCALAR_KEYS)[number];

/**
 * 3D 계층이 읽는 테마 상태.
 *
 * 큐브 안의 모든 모듈이 이걸 받는다. 색은 **제자리에서 변경**하고 절대 새로 만들지
 * 않는다 — 유니폼에 넘긴 `THREE.Color`는 참조로 붙들려 있어서, 객체를 갈아 끼우면 여전히
 * 옛것을 가리키고 있는 재질들이 조용히 미아가 된다.
 */
export interface ResolvedTheme {
  readonly colors: Readonly<Record<ThreeColorKey, THREE.Color>>;
  readonly scalars: Record<ThreeScalarKey, number>;
  /** 완전한 어둠에서 0, 완전한 밝음에서 1 — 셰이더에서 한 번씩 분기할 때 쓴다. */
  dayAmount: number;
}

/** 시작할 때 레코드를 한 번 만든다. 테마 간 이동은 `applyCubeTheme`으로 한다. */
export function resolveCubeTheme(name: CubeThemeName): ResolvedTheme {
  const colors = {} as Record<ThreeColorKey, THREE.Color>;
  for (const key of THREE_COLOR_KEYS) colors[key] = new THREE.Color().setStyle(CUBE_TOKENS[key]);

  const scalars = {} as Record<ThreeScalarKey, number>;
  for (const key of THREE_SCALAR_KEYS) scalars[key] = CUBE_TOKENS[key];

  const resolved: ResolvedTheme = { colors, scalars, dayAmount: 0 };
  applyCubeTheme(resolved, name);
  return resolved;
}

/**
 * 이미 만들어진 테마 레코드를 제자리에서 다른 모드로 옮긴다.
 *
 * 배경과 `dayAmount`만 움직이는데, 실제로 그 둘만 다르기 때문이다 — 나머지는 전부 생성
 * 시점에 `CUBE_TOKENS`에서 쓴 값이고 두 모드에서 같다. 그래도 스테이지는 이후에 레코드
 * 전체를 서브시스템에 다시 뿌리는데, 유니폼 몇 개 쓰는 비용으로 호출하는 쪽이 이 사정을
 * 몰라도 되게 해 준다.
 */
export function applyCubeTheme(resolved: ResolvedTheme, name: CubeThemeName): void {
  const backdrop = CUBE_BACKDROPS[name];
  resolved.colors.bgCenter.setStyle(backdrop.bgCenter);
  resolved.colors.bgEdge.setStyle(backdrop.bgEdge);
  resolved.dayAmount = name === 'light' ? 1 : 0;
}

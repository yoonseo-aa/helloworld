import * as THREE from 'three';
import type { ResolvedTheme } from '../theme';
import type { DeviceTier } from '../lib/deviceTier';

/**
 * 따뜻한 쪽이 주도하는 3점 조명 리그. 구조는 두 테마에서 동일하고, 세기와 색온도와 필의
 * 기여분만 달라진다.
 *
 * ### 잔불(ember) 조명이 존재하는 이유
 *
 * three.js에는 전역 조명이 없다. 재질의 `emissive`도, 순수 발광체로 쓰인
 * `MeshBasicMaterial`도 — 유물의 코어가 바로 그것이다 — **자기 자신의** 프래그먼트만
 * 밝힌다. 다른 표면의 조명에는 아무것도 기여하지 않고, 블룸도 그걸 바꾸지 못한다. 블룸은
 * 사후에 밝은 픽셀을 옆으로 번지게 하는 스크린 공간 필터라서, 광자 하나 옆의 돌에 닿지
 * 않은 채로도 코어를 빛나 보이게 만들 수 있다.
 *
 * 그래서 주변을 밝혀야 하는 발광체에는 같은 자리에 놓인 실제 광원이 필요하다. 그게 이
 * 잔불이다. 발광을 씬 밖으로 실어 나르고, 그 세기는 코어의 발광을 구동하는 것과 같은
 * `awakening` 값이 구동한다 — 그래서 둘이 코어의 밝기에 대해 서로 다른 말을 할 수 없다.
 *
 * 포인트 라이트는 근사다. 코어는 홈 열두 개로 새어 나오는 정육면체이지 크기 없는 점이
 * 아니다. 면마다 `RectAreaLight`를 두면 발광 면적을 제대로 모델링하겠지만, 몸통 하나당
 * 조명 여섯 개가 들고, `castShadow`를 아예 무시하며, 조립이 끝나면 스물일곱 배가 된다.
 * 유물당 포인트 라이트 하나에 감쇠 범위를 몸통에 맞춘 것이 감당 가능한 버전이다.
 */
/** 실시간으로 조정 가능한 리그의 기하와 게인. 개발용 튜닝 패널에 노출한다. */
export interface RigSettings {
  keyAzimuth: number;
  keyElevation: number;
  keyDistance: number;
  keyGain: number;
  rimAzimuth: number;
  rimElevation: number;
  rimGain: number;
  fillGain: number;
  emberGain: number;
  emberRange: number;
  /**
   * 코어의 발광 면적(월드 유닛 제곱). 잔불의 출력이 여기에 비례하므로, 빛나는 몸통이
   * 클수록 그만큼 더 많은 빛을 던진다 — 발광 재질이 혼자서는 표현할 수 없는 물리적 관계다.
   */
  emberArea: number;
}

export const RIG_DEFAULTS: RigSettings = {
  keyAzimuth: 140,
  keyElevation: 42,
  keyDistance: 9,
  keyGain: 1,
  rimAzimuth: -30,
  rimElevation: 14,
  rimGain: 1,
  fillGain: 1,
  emberGain: 1,
  emberRange: 3.4,
  // 1.93짜리 코어의 여섯 면 중, 홈이 실제로 드러내는 비율.
  emberArea: 2.2,
};

export interface LightingRig {
  readonly group: THREE.Group;
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly ember: THREE.PointLight;
  applyTheme(theme: ResolvedTheme): void;
  /** 0..1 — 심에 전체적으로 얼마나 불이 들어왔는가. 잔불 조명과 키 보정을 구동한다. */
  setAwakening(amount: number): void;
  setRig(settings: RigSettings): void;
  /** 그림자를 드리울 식생이 생긴 뒤에만 켠다. 켜져 있는 동안 뎁스 패스를 통째로 쓴다. */
  setCastShadow(enabled: boolean): void;
  dispose(): void;
}

/** 구면 좌표로 배치한다. 패널에서 벡터를 타이핑하는 대신 조명을 궤도로 돌릴 수 있게. */
function place(light: THREE.Light, azimuthDeg: number, elevationDeg: number, distance: number): void {
  const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  light.position.set(
    Math.cos(elevation) * Math.sin(azimuth) * distance,
    Math.sin(elevation) * distance,
    Math.cos(elevation) * Math.cos(azimuth) * distance,
  );
}

/** 키의 그림자 절두체 반너비: 유물과 그 치맛자락, 그리고 조립체까지 덮는다. */
const SHADOW_EXTENT = 4.2;

/**
 * 바닥에서 되돌아오는 빛의 양. 테마의 필 세기에 대한 배수다.
 *
 * 두 배가 조금 넘는다. 필은 아주 낮게 잡혀 있고 — 그늘진 **옆면**을 검정에서 떼어놓기만
 * 하면 됐다 — 밑면은 아예 0에서 시작하므로, 필에 정확히 맞추면 여전히 구멍으로 읽혔다.
 */
const BOUNCE_RATIO = 2.4;

export function createLighting(tier: DeviceTier): LightingRig {
  const group = new THREE.Group();
  group.name = 'lighting';

  // 키는 왼쪽 위, 그리고 충분히 앞쪽에 앉는다. 비트 04·05에서 카메라가 실제로 보는 두 면이
  // 조명받는 면이 되도록 — 유물 뒤쪽을 스치듯 훑는 대신에.
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-4.2, 6.0, 5.6);
  // 그림자를 드리우는 건 키 하나뿐이다. 그림자 있는 조명을 하나 더 두면 아무도 못 알아채는
  // 차이를 위해 뎁스 패스가 두 배가 되고, 애초에 림과 필은 키가 어둡게 남긴 곳을 **열어
  // 주려고** 있는 것이라 그것들에 그림자를 주면 존재 이유가 사라진다.
  //
  // 실제로 뭔가 심어지기 전까지는 꺼 둔다. 스테이지가 비트 03에서 켠다. 유물이 헐벗은
  // 동안에는 윗면에 그림자를 드리울 게 없어서 뎁스 패스 전체가 그걸 증명하는 데만 쓰인다.
  key.castShadow = false;
  key.shadow.mapSize.set(tier.shadowMapSize, tier.shadowMapSize);
  const shadowCamera = key.shadow.camera;
  shadowCamera.left = -SHADOW_EXTENT;
  shadowCamera.right = SHADOW_EXTENT;
  shadowCamera.top = SHADOW_EXTENT;
  shadowCamera.bottom = -SHADOW_EXTENT;
  // 풀잎이 텍셀 너비보다 가늘어서, 상수 bias를 쓰면 돌 위로 얼룩(acne)이 새거나 풀잎이
  // 자기 그림자에서 떠 버린다. `normalBias`는 대신 표면 법선을 따라 샘플을 옮기는데,
  // 이 정도로 심한 기울기에는 그게 필요하다.
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.022;
  key.shadow.radius = 2.6 * tier.shadowSoftness;
  group.add(key);
  group.add(key.target);

  const rim = new THREE.DirectionalLight(0xffffff, 1);
  rim.position.set(2.6, 1.4, -4.6);
  group.add(rim);
  group.add(rim.target);

  const fill = new THREE.DirectionalLight(0xffffff, 1);
  fill.position.set(4.2, -1.6, 2.4);
  group.add(fill);
  group.add(fill.target);

  /**
   * 바닥 반사광. 아래에서 곧장 위로 올라온다.
   *
   * 큐브는 떠 있고, 지금까지 바닥을 향한 면들은 아무 빛도 받지 못했다 — 키·림·필이 전부
   * 허리 위에 있어서 밑면이 그늘진 돌이 아니라 납작한 검정 절단면으로 읽혔다. 어떤 표면
   * 위에 놓인 물체는 그 표면이 되던지는 빛을 얼마간 받게 되어 있고, 눈은 그게 없는 것을
   * "이 물건이 이 방에 있지 않다"로 읽는다.
   *
   * 자기 토큰을 주는 대신 필에 묶어 뒀다. 키가 남긴 것을 열어 주는 같은 일을 반대편에서
   * 하는 것이므로 필이 움직일 때 같이 움직여야 하고, 그러면 동기화할 두 번째 숫자가 없다.
   * 차갑고 약하다 — 반사광은 언제나 그걸 만든 빛보다 어둡고 채도가 낮다.
   */
  const bounce = new THREE.DirectionalLight(0xbfc6d8, 1);
  bounce.position.set(-1.4, -6, 1.8);
  group.add(bounce);
  group.add(bounce.target);

  // 짧은 사거리와 절제된 세기. 코어는 홈으로 새어 나오는 빛이지, 유물 전체를 호박색으로
  // 다시 칠하는 램프가 아니다.
  const ember = new THREE.PointLight(0xffffff, 0, 3.4, 2);
  ember.position.set(0, 0, 0);
  group.add(ember);

  let awakening = 0;
  let keyBase = 1;
  let rimBase = 1;
  let fillBase = 1;
  const emberColor = new THREE.Color();
  const rig: RigSettings = { ...RIG_DEFAULTS };

  const refresh = (): void => {
    // 유물이 깨어나면서 키를 조금 더 받는다. 주목과 함께 도착하는 빛.
    key.intensity = keyBase * rig.keyGain * (0.82 + awakening * 0.18);
    rim.intensity = rimBase * rig.rimGain * (0.7 + awakening * 0.3);
    // 필은 정원과 함께 올라간다. 유물이 깨어난 뒤 그늘진 면들이 진흙으로 뭉개지지 않고
    // 읽히는 중간톤을 유지하도록.
    fill.intensity = fillBase * rig.fillGain * (1 + awakening * 1.6);
    // `rig.fillGain`을 일부러 곱하지 **않는다.**
    //
    // 예전엔 곱했다. 필과 반사광이 반대편에서 같은 일을 하니 같이 움직여야 한다는 논리였다.
    // 그건 로그인 장면을 진열장으로 다시 연출하기 전까지 성립했다. 거기서는 필을 0에
    // 가깝게 두는 게 핵심인데, 같은 키프레임이 바닥의 반사광까지 조용히 끌어내려서 밑면을
    // 이 조명이 고치려던 그 납작한 검정 절단면으로 되돌려 놨다. 둘은 같은 장비가 아니다 —
    // 필은 장면마다의 조명 **선택**이고, 이건 바닥이 거기 있다는 사실 자체다.
    bounce.intensity = fillBase * BOUNCE_RATIO * (0.6 + awakening * 0.8);
    // 광도 × 발광 면적. `awakening`은 코어의 셰이더가 발광에 쓰는 것과 같은 신호라서,
    // 이웃이 받는 빛은 언제나 코어가 내보내는 것을 따라간다 — 돌 위로 퍼지는 빛이 코어
    // 자신의 빛이지, 마침 옆에 있는 별개의 램프가 아니게 된다.
    ember.intensity = awakening * awakening * rig.emberArea * rig.emberGain;
    ember.distance = rig.emberRange;
    ember.color.copy(emberColor);
  };

  const placeKey = (): void => {
    place(key, rig.keyAzimuth, rig.keyElevation, rig.keyDistance);
    // 절두체가 조명을 따라 들어와야 한다. 안 그러면 유물이 그 뒤로 빠진다.
    const shadow = key.shadow.camera;
    shadow.near = Math.max(0.5, rig.keyDistance - SHADOW_EXTENT - 1.5);
    shadow.far = rig.keyDistance + SHADOW_EXTENT + 1.5;
    shadow.updateProjectionMatrix();
  };

  placeKey();
  place(rim, rig.rimAzimuth, rig.rimElevation, 5.6);

  return {
    group,
    key,
    rim,
    fill,
    ember,
    applyTheme(theme) {
      keyBase = theme.scalars.keyIntensity;
      rimBase = theme.scalars.rimIntensity;
      fillBase = theme.scalars.fillIntensity;
      key.color.copy(theme.colors.keyColor);
      rim.color.copy(theme.colors.rimColor);
      fill.color.copy(theme.colors.fillColor);
      emberColor.copy(theme.colors.ember);
      refresh();
    },
    setAwakening(amount) {
      awakening = amount;
      refresh();
    },
    setRig(settings) {
      Object.assign(rig, settings);
      placeKey();
      place(rim, rig.rimAzimuth, rig.rimElevation, 5.6);
      refresh();
    },
    setCastShadow(enabled) {
      key.castShadow = enabled;
    },
    dispose() {
      key.dispose();
      rim.dispose();
      fill.dispose();
      bounce.dispose();
      ember.dispose();
      group.removeFromParent();
    },
  };
}

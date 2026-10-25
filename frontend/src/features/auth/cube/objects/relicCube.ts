import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ResolvedTheme } from '../theme';

/**
 * 유물 그 자체: 빛나는 코어를 둘러싼 여섯 장의 돌판.
 *
 * 표면은 패킹된 노이즈 텍스처 하나에서 삼중평면 매핑으로 만든다. 그래서 쓸 만한 UV 배치가
 * 없는 판들도 어느 각도에서든 하나의 돌덩어리로 읽히고, 같은 재질이 2.2짜리 주인공과
 * 1.088짜리 조각들을 이음매나 늘어짐 없이 함께 담당한다.
 */

export const RELIC_EDGE = 2.2;

/**
 * 판의 구성. 몸통 한 변에 대한 비율이다.
 *
 * 유물 몸통은 상자 하나가 아니다. 빛나는 코어를 여섯 장의 개별 판이 감싼 것이고 — 면마다
 * 한 장 — 각 판은 몸통 모서리에서 안쪽으로 물러나 있어서 열두 모서리를 따라 홈이 열리며,
 * 넉넉히 필렛을 줘서 어떤 모서리도 날카롭게 읽히지 않는다. 그 홈으로 보이는 것이 코어이고,
 * 그래서 심의 빛이 오브젝트에 붙인 띠가 아니라 **안에** 있는 것이 된다.
 */
export const PLATE_THICKNESS = 0.062;
export const PLATE_GAP = 0.013;
export const PLATE_FILLET = 0.02;

/** 프레이밍 계산용. 몸통의 바깥쪽 반너비가 필요해서 남겨 둔다. */
export const BEVEL_RADIUS = PLATE_FILLET * RELIC_EDGE;

/** 비트 03–05에서 유물이 안착하는 요(yaw). 카메라 키프레임이 이걸 전제한다. */
export const RELIC_SETTLED_YAW = -Math.PI * (32 / 180);

/**
 * 여섯 장의 면 판을 버퍼 하나로 합쳐서, 몸통 하나가 여전히 드로우콜 하나로 끝나게 한다.
 * 판의 로컬 좌표는 몸통 자신의 공간에 머무르므로, 삼중평면 돌이 여섯 장에 걸쳐 연속으로
 * 읽힌다 — 같은 덩어리에서 잘라낸 것처럼 보인다.
 */
export function createPlateShellGeometry(edge: number, segments = 3): THREE.BufferGeometry {
  const half = edge * 0.5;
  const thickness = edge * PLATE_THICKNESS;
  const gap = edge * PLATE_GAP;
  const fillet = Math.min(edge * PLATE_FILLET, thickness * 0.46);

  // 판은 이웃이 시작되는 지점 앞에서 멈춰야 한다. 아니면 여섯 장이 그냥 하나의 상자로
  // 융합되고 홈이 아예 열리지 않는다. 그래서 접선 방향 반너비가 수직 판의 안쪽 면보다
  // 정확히 `gap`만큼 앞에서 끝난다.
  const span = (half - thickness - gap) * 2;
  const offset = half - thickness * 0.5;

  const parts: THREE.BufferGeometry[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const width = axis === 0 ? thickness : span;
      const height = axis === 1 ? thickness : span;
      const depth = axis === 2 ? thickness : span;
      const plate = new RoundedBoxGeometry(width, height, depth, segments, fillet);
      plate.translate(
        axis === 0 ? sign * offset : 0,
        axis === 1 ? sign * offset : 0,
        axis === 2 ? sign * offset : 0,
      );
      parts.push(plate);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('plate-merge-failed');
  return merged;
}

/**
 * 판들이 둘러싼 공동을 채우는 발광 코어. 판의 안쪽 면 크기에 맞춰서, 모든 모서리 홈으로
 * 비쳐 보이는 것이 정확히 이것이 되게 한다.
 */
export function createCoreGeometry(edge: number): THREE.BufferGeometry {
  const inner = edge - edge * PLATE_THICKNESS * 2;
  return new RoundedBoxGeometry(inner, inner, inner, 2, inner * 0.06);
}

// ── 단단해지기 ───────────────────────────────────────────────────────────────────────

/**
 * 몸통이 빛에서 나오며 도착한다. 페이드가 아니라 디더로.
 *
 * 영상의 두 크로스페이드 모두 그려지던 케이지를 돌에게 넘긴다. 비트 02의 유물 쪽은 평범한
 * 알파 블렌드로 해도 된다. 빈 프레임에 실루엣 하나뿐이라, 거기서 반투명한 돌은 그냥 흐린
 * 돌이다. 3×3×3은 그럴 수 없다. 블렌딩되는 상자 스물여섯 개가 각자 자기 뒷면 판과 그 뒤의
 * 몸통들을 비추고, three는 반투명을 뒤에서 앞으로 정렬하므로 가까운 몸통이 이미 그려진
 * 모든 것 **위에** 블렌딩된다 — `depthWrite`로도 되돌릴 수 없다. 불투명도 68%에서 측정했을
 * 때 조립체가 컷글라스 진열장처럼 읽혔는데, 마지막 컷이 절대 그래선 안 되는 바로 그것이다.
 *
 * 그래서 등장은 블렌드가 아니라 discard다. 재질은 불투명하게 남아 깊이를 쓰고 불투명 큐에서
 * 정렬되며, 살아남은 모든 프래그먼트는 완전한 솔리드 돌이다. 건너오는 것은 **유지되는
 * 프래그먼트의 비율**이다. 인터리브드 그래디언트 노이즈가 그걸 눈에 띄는 타일링 없이 곱고
 * 고른 결로 만들어 주고 비용은 내적 하나다 — 게다가 그 결은, 방금까지 부서지고 있던 것이
 * 스파크 줄기인 컷에 잘 어울린다.
 *
 * `uReveal`은 넘겨받는 중이 아닌 모든 몸통에서 1이고, 영상의 1초 남짓을 뺀 전부가 그
 * 상태이며, 이 분기는 드로우 전체에서 균일하다.
 */
const REVEAL_PARS = /* glsl */ `
  uniform float uReveal;

  float revealThreshold(vec2 fragment) {
    return fract(52.9829189 * fract(dot(fragment, vec2(0.06711056, 0.00583715))));
  }
`;

/**
 * main의 첫 청크인 `clipping_planes_fragment`에 주입한다. 그래야 버려지는 프래그먼트가
 * 임계값 계산 외에는 아무 비용도 들지 않는다.
 */
const REVEAL_BODY = /* glsl */ `
  if (uReveal < 0.999 && revealThreshold(gl_FragCoord.xy) >= uReveal) discard;
`;

// ── 돌 ───────────────────────────────────────────────────────────────────────────────

const STONE_VERT_PARS = /* glsl */ `
  varying vec3 vTriPos;
  varying vec3 vTriNormal;
  uniform mat4 uSlotSpace;
  uniform float uSlotJitter;
`;

/**
 * 모든 몸통이 같은 덩어리에서 잘려 나왔고, 그게 눈에 보였다.
 *
 * 삼중평면 투영은 `position` — 정점의 **자기** 오브젝트 공간 좌표 — 을 샘플링한다. 스물일곱
 * 조각이 지오메트리 하나를 공유하므로 스물일곱 개 전부가 픽셀 단위로 동일한 로컬 좌표를
 * 갖고, 동일한 텍셀을 샘플링하고, 동일한 돌을 입었다. 비슷한 게 아니라 같은 것이,
 * 스물일곱 번 타일링된 것이다. 그리고 정확히 그렇게 보였다 — 돌 무늬 한 장을 모든 면에
 * 붙여 놓은 것처럼.
 *
 * 해법은 각 몸통을 노이즈 필드의 자기 영역으로 옮기는 것이고, 그 가장 싼 손잡이는 몸통이
 * 이미 있는 위치다. `uSlotSpace`는 스핀 루트 월드 행렬의 역행렬이라, 여기에 `modelMatrix`를
 * 곱하면 큐브 전체의 회전이 다시 나눠지고 몸통의 변환이 격자 자신의 좌표계로 남는다.
 *
 * ### 왜 **회전**까지 되돌려야 하는가
 *
 * 그 행렬에서 슬롯을 바로 뽑는 방식은 층이 회전하기 전까지만 동작한다. `attach()`가 회전을
 * 몸통에 구워 넣으므로 슬롯이 다른 격자점이 되고, 다른 노이즈 패치에 떨어지며, 움직이는
 * 도중에 돌이 눈에 띄게 바뀐다 — 화강암 한 덩이가 보는 앞에서 다른 화강암으로 변하는 것이다.
 *
 * 그런데 회전은 강체 운동이다. 몸통의 위치 **와** 방향을 같은 회전으로 함께 옮긴다. 그러니
 * 한쪽을 되돌리면 다른 쪽도 되돌아간다. 회전이 Q라면 몸통은 `Q·p`로 옮겨 가고 방향은
 * `Q·R`이 되며,
 *
 *     inverse(Q·R) · (Q·p)  =  inverse(R) · p
 *
 * — 회전 전의 값이고, 그 이전 모든 회전 전의 값이다. 각 몸통은 아무것도 저장하지 않고
 * 태어날 때의 패치를 유지한다. 원래 슬롯을 기억하는 게 아니라 매 프레임 **복원**하는 것이다.
 *
 * 공유 유니폼 하나로 끝난다. 대안은 몸통마다 지오메트리 복제(숫자 하나 나르자고 중복 버퍼
 * ~3MB)나 몸통마다 재질이었는데, 이미 셰이더 안에 있는 행렬에서 읽어낼 수 있는 값에 그럴
 * 가치는 없다.
 *
 * `uSlotJitter`는 어림수로 고른 게 아니라 두 샘플 스케일 모두에 대해 고른 값이다. 맵이
 * 타일링되므로, 오프셋이 타일 정수 배 근처에 떨어지면 피하려던 그 패턴을 그대로 재현한다.
 * 2.9에서 격자 한 칸은 몸통을 3.21유닛 옮기는데, 거친 타일로 1.35개, 고운 타일로 3.50개다 —
 * 둘 다 반복점에서 넉넉히 떨어져 있다.
 */
const STONE_VERT_BODY = /* glsl */ `
  mat4 stoneLattice = uSlotSpace * modelMatrix;
  mat3 stoneBasis = mat3(stoneLattice);
  // 이 기저는 몸통의 회전뿐 아니라 자기 스케일도 실어 나르는데, 그 스케일은 균일하므로
  // (rubik.ts의 bodyScale) 열 하나의 길이로 복원된다. 나눠서 빼야 한다. 안 그러면 넘겨받는
  // 동안의 0.86 → 1 수축이 격자가 아직 도착하는 중에 샘플을 노이즈 필드 위로 끌고 다닌다.
  // 제곱이 아니라 한 번이다. 기저가 s*R이므로 그 전치는 s*R-전치이고, 한 번 나누면 순수한
  // 역회전이 남는다.
  float stoneScale = max(length(stoneBasis[0]), 1e-4);
  vec3 stoneHome = (transpose(stoneBasis) * stoneLattice[3].xyz) / stoneScale;
  vTriPos = position + stoneHome * uSlotJitter;
  vTriNormal = normalize(normal);
`;

const STONE_FRAG_PARS = /* glsl */ `
  uniform sampler2D uStoneMap;
  uniform vec3 uStoneBase;
  uniform vec3 uStoneShadow;
  uniform vec3 uStoneLit;
  uniform float uTexScale;
  uniform float uBump;
  uniform float uAoGroove;
  uniform float uAoStrength;
  varying vec3 vTriPos;
  varying vec3 vTriNormal;

  vec4 triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(w.x + w.y + w.z, 0.0001);
    return texture2D(tex, p.zy * scale) * w.x
         + texture2D(tex, p.xz * scale) * w.y
         + texture2D(tex, p.xy * scale) * w.z;
  }
`;

/**
 * 패킹된 맵에서 값을 가져오는 부분. 색·러프니스·노멀 주입이 함께 쓴다.
 *
 * 텍스처 하나에서 스케일 둘: 넓은 색조 변화를 위한 거친 패스와, 결을 위한 고운 패스.
 * 여기에는 딱딱한 경계도, 눈이 붙잡을 수 있는 반복 주기도 없다.
 */
const STONE_SAMPLE = /* glsl */ `
  vec4 coarseSample = triplanar(uStoneMap, vTriPos, vTriNormal, uTexScale);
  vec4 fineSample = triplanar(uStoneMap, vTriPos + vec3(13.7, 5.1, 9.3), vTriNormal, uTexScale * 2.6);
  float stoneMacro = coarseSample.r;
  float stoneGrain = fineSample.g;
`;

const STONE_COLOR_BODY = /* glsl */ `
  // 색조 변화와 고운 결뿐이다. 예전엔 판 격자와 균열망도 여기서 곱해졌는데, 둘 다 타일링
  // 패턴이다. 여섯 판과 스물일곱 몸통에 반복되면 돌이 아니라 인쇄된 벽지로 읽히므로,
  // 이제 표면은 눈에 띄게 반복될 수 있는 것을 아무것도 담지 않는다. 균열망은 완전히
  // 사라졌다 — 맵의 파란 채널을 읽던 마지막 것이었다.
  // 결은 일부러 부차적인 항이다. 예전엔 색조 범위의 3분의 1을 실어 날랐는데, 격자와 균열이
  // 그 위에 있는 동안에는 안 보이다가 그것들이 사라지자 모래처럼 읽혔다 — 참조 이미지의
  // 돌은 매끈하고 창백한 덩어리이지 오돌토돌한 것이 아니다. 이제 넓은 필드가 일을 하고
  // 결은 그 경계를 흩뜨리기만 한다.
  float stoneShade = clamp(0.34 + stoneMacro * 0.58 + stoneGrain * 0.15, 0.0, 1.0);
  vec3 stoneAlbedo = mix(uStoneShadow, uStoneBase, stoneShade);
  stoneAlbedo = mix(stoneAlbedo, uStoneLit, smoothstep(0.55, 1.0, stoneShade) * 0.62);

  // 이미 중성인 토큰 위에, 중성 쪽으로 마지막 한 번 더 민다.
  float stoneLuma = dot(stoneAlbedo, vec3(0.2126, 0.7152, 0.0722));
  stoneAlbedo = mix(stoneAlbedo, vec3(stoneLuma), 0.35);

  // 모든 면이 같은 돌이다.
  //
  // 예전엔 윗면이 커밋 격자를 담았다 — 식재가 앉을 자리로, 빽빽한 칸일수록 어둡고 진한
  // 흙 쪽으로 물들인 것. vTriNormal은 **조각 자신의** 노멀이라, 비트 05의 층 회전이 몸통을
  // 돌리고 나면 그 로컬 윗면이 아래를 향할 수 있고, 조립체 밑면에 갈색 패치가 보였다.
  // 정원이 사라지면서 그 색조가 흙 노릇을 해 줄 대상이 없어졌으므로, 가리는 대신 없앤다.

  diffuseColor.rgb *= stoneAlbedo;
`;

const STONE_ROUGHNESS_BODY = /* glsl */ `
  roughnessFactor = clamp(0.58 + stoneGrain * 0.14, 0.06, 1.0);
`;

/**
 * 스크린 공간 미분 범프. 라운드 박스에는 탄젠트가 없으므로, three 자신의 범프 맵과 같은
 * 방식으로 높이 기울기에서 표면 요철을 재구성한다.
 */
const STONE_NORMAL_BODY = /* glsl */ `
  {
    // 알베도와 같은 이유이고, 여기서 더 중요하다. 고주파 높이 필드는 스치는 키 라이트
    // 아래에서 표면을 눈에 보이는 사포로 만드는 바로 그것이다.
    float height = stoneMacro * 0.42 + stoneGrain * 0.16;
    vec3 dpdx = dFdx(-vViewPosition);
    vec3 dpdy = dFdy(-vViewPosition);
    float dhdx = dFdx(height);
    float dhdy = dFdy(height);
    vec3 r1 = cross(dpdy, normal);
    vec3 r2 = cross(normal, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
    normal = normalize(abs(det) * normal - uBump * grad);
  }
`;

/**
 * 절차적 앰비언트 오클루전. 구워 둔 AO 맵도 없고 SSAO 패스도 없다. 차폐는 표면이 이미 갖고
 * 있는 데이터에서 재구성한다:
 *
 *   · 공동(cavity) — 판의 홈이 환경광을 가둔다
 *
 * three 자신의 `aomap_fragment`가 하는 것과 똑같이 간접광에만 적용하므로, 직접 키와 림의
 * 반응은 건드리지 않고 유물이 그냥 밋밋한 회색이 되는 일이 없다.
 */
const STONE_AO_BODY = /* glsl */ `
  // 공동 차폐가 이제 제거된 격자가 아니라 부드러운 색조 필드를 탄다. 그래서 반복 패턴을
  // 다시 들여오지 않고도 넓은 우묵함에 음영을 준다.
  float cavityAo = 1.0 - clamp((1.0 - stoneMacro) * uAoGroove * 0.5, 0.0, 1.0);


  float ambientOcclusion = mix(1.0, clamp(cavityAo, 0.0, 1.0), uAoStrength);
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float aoDotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( aoDotNV, ambientOcclusion, material.roughness );
  #endif
`;

/** 차폐 조절값. 개발용 튜닝 패널이 실시간으로 구동할 수 있게 노출한다. */
export interface StoneAoSettings {
  groove: number;
  strength: number;
  bump: number;
}

/** 두 테마의 비트 03–05에 대고 `?tune` 패널에서 잡은 값. */
export const STONE_AO_DEFAULTS: StoneAoSettings = {
  groove: 0.65,
  // 테마별로 `aoStrength`가 덮어쓴다. 여기 값은 패널의 시작점일 뿐이다.
  strength: 1,
  bump: 0.028,
};

export interface StoneMaterial {
  readonly material: THREE.MeshStandardMaterial;
  applyTheme(theme: ResolvedTheme): void;
  /** 정원이 얼마나 존재하는가. 접촉 차폐가 식물과 함께 도착하도록. */
  setAo(settings: StoneAoSettings): void;
  /** 표면이 얼마나 존재하는가(0…1). 페이드가 아니라 디더로 — `REVEAL_PARS` 참고. */
  setReveal(value: number): void;
  /**
   * 격자의 슬롯이 정의된 좌표계 — 몸통들이 매달려 있는 것의 역행렬. 이걸 알려 주는 것이
   * 각 몸통이 자기 돌 패치를 찾게 해 준다. `STONE_VERT_BODY` 참고.
   */
  setSlotSpace(matrix: THREE.Matrix4): void;
  dispose(): void;
}

export function createStoneMaterial(stoneTexture: THREE.Texture): StoneMaterial {
  const uniforms = {
    uStoneMap: { value: stoneTexture },
    uStoneBase: { value: new THREE.Color() },
    uStoneShadow: { value: new THREE.Color() },
    uStoneLit: { value: new THREE.Color() },
    // 판 타일 하나가 약 2.4유닛을 덮으므로 2.2짜리 면에 대략 세 장이 들어간다 —
    // 철망 격자가 아니라 건축 석조에 가깝다.
    uTexScale: { value: 0.42 },
    uBump: { value: 0.028 },
    uAoGroove: { value: STONE_AO_DEFAULTS.groove },
    uAoStrength: { value: 1 },
    uReveal: { value: 1 },
    // 주인공이 격자 좌표계를 알려 주기 전까지는 항등행렬이다. 항등에서는 각 몸통이 그냥
    // 자기 월드 위치를 샘플링하는데, 그것도 여전히 몸통마다 다르고 여전히 다양하다.
    uSlotSpace: { value: new THREE.Matrix4() },
    uSlotJitter: { value: 2.9 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.04,
    envMapIntensity: 1,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${STONE_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${STONE_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STONE_FRAG_PARS}\n${REVEAL_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${REVEAL_BODY}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_SAMPLE}\n${STONE_COLOR_BODY}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${STONE_ROUGHNESS_BODY}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_NORMAL_BODY}`)
      // 기본 청크는 aoMap이 없으면 아무 일도 안 하므로 통째로 대체한다.
      .replace('#include <aomap_fragment>', STONE_AO_BODY);
  };
  material.customProgramCacheKey = () => 'relic-stone';

  return {
    material,
    applyTheme(theme) {
      uniforms.uStoneBase.value.copy(theme.colors.stoneBase);
      uniforms.uStoneShadow.value.copy(theme.colors.stoneShadow);
      uniforms.uStoneLit.value.copy(theme.colors.stoneLit);
      uniforms.uAoStrength.value = theme.scalars.aoStrength;
      material.envMapIntensity = 0.6 + theme.scalars.envIntensity * 0.8;
    },
    setAo(settings) {
      uniforms.uAoGroove.value = settings.groove;
      uniforms.uAoStrength.value = settings.strength;
      uniforms.uBump.value = settings.bump;
    },
    setReveal(value) {
      uniforms.uReveal.value = value;
    },
    setSlotSpace(matrix) {
      uniforms.uSlotSpace.value.copy(matrix);
    },
    dispose() {
      material.dispose();
    },
  };
}

// ── 코어 ─────────────────────────────────────────────────────────────────────────────

/**
 * 빛의 전선이 훑고 지나가는 방향. 몸통 로컬 공간에서 제일 어두운 모서리로부터 앞쪽 위
 * 모서리를 향한다. 셰이더에서 몸통의 반너비로 정규화하므로, 방향 하나가 2.2짜리 유물과
 * 1.088짜리 조각을 똑같이 담당한다.
 */
const SWEEP_DIR = new THREE.Vector3(1, 0.42, 0.3).normalize();

const SEAM_VERT_PARS = /* glsl */ `
  varying vec3 vCorePos;
  varying vec3 vCoreNormal;
`;

/**
 * 코어 자신의 표면. 판이 쓰는 것과 같은 패킹 맵에서 샘플링한다.
 *
 * 표면 없는 발광체는 라이트박스다. 잠든 코어가 모든 홈을 통해 납작한 판지처럼 읽혔고,
 * 불이 들어와도 아무것도 없는 깨끗한 호박색 물감이었다. 설정상 판과 코어는 한 덩어리에서
 * 잘려 나온 것이므로, 코어도 같은 삼중평면 돌을 입는다 — 다만 알베도가 아니라 자기가
 * **내보내는 것에 대한 변조**로서다. 여전히 조명되지 않고 여전히 붙잡을 빛이 없기 때문이다.
 * 그 결과 결이 표면의 낮은 곳에 빛이 고이고 높은 곳을 따라 밝게 흐르는 것으로 나타난다.
 */
const CORE_TEXTURE = /* glsl */ `
  vec3 coreNormal = normalize(vCoreNormal);
  vec4 coreCoarse = triplanar(uStoneMap, vCorePos, coreNormal, uTexScale);
  vec4 coreFine = triplanar(uStoneMap, vCorePos + vec3(4.9, 11.3, 7.7), coreNormal, uTexScale * 2.6);
  float coreGrain = clamp(0.46 + coreCoarse.r * 0.72 + coreFine.g * 0.22, 0.0, 1.35);
`;

/**
 * 발광의 바닥과 천장.
 *
 * 하중을 지는 쪽은 바닥이다. 블룸 임계값의 무릎 아래에서 밝은 표면은 그냥 밝은 표면일 뿐이고,
 * 그것이 먹여야 할 패스는 그걸 아예 보지 못한다. 케이지가 광원으로 읽히게 만드는 숫자가
 * 이것이므로, 코어가 광원으로 읽히게 만드는 숫자도 이것이다.
 *
 * 한동안은 케이지 자신의 2.35 / 4.6이었고, 8비트 블룸 체인에 대해서는 다른 값이어야 할
 * 이유가 없었다 — 1.0을 넘는 건 전부 같은 클램프된 흰색에 떨어졌으니, 두 번째 발광 단위가
 * 무언가를 하는 마지막 단위였다. 지금 체인은 half-float이고(`scene/postfx.ts` 참고) 흰색
 * 위의 높이가 드디어 글로우가 읽을 수 있는 양이 되었는데, 그러고 보니 2.35는 **어두웠다.**
 * 메인 렌더에서 빨강과 초록 채널을 클리핑시킬 만큼이고 그 이상은 아닌데, 그게 정확히
 * 예전 홈들이 띠던 창백한 노랑이다.
 *
 * 9.6은 파란 채널에 맞춰 고른 값이다. 심 색은 `#F5B95A`이고 그 파랑은 선형으로 0.107이라,
 * 9.6은 마지막 채널이 1.0에 도달해 홈 자체가 드디어 흰색으로 타는 발광량이다 — 호박색은
 * 그 주변 후광에만 남고, 뜨거운 물체의 색이 있어야 할 자리가 거기다. 그 아래에서는 블룸을
 * 아무리 던져도 선이 노란색으로 남는데, 블룸이 그리는 것은 선이 아니기 때문이다.
 *
 * 천장은 따로 고르지 않고 케이지의 비율(1.96배)을 유지한다. `uHot`은 점화 전선이 도달하는
 * 값이고, 그 전선은 늘 정상 상태 선의 두 배쯤이었다.
 */
const CORE_GLOW_BASE = 9.6;
const CORE_GLOW_HOT = 18.8;

/**
 * 글로우 패스를 돌리지 않는 등급 — `tier.postfx`가 false이고 흰색 위의 높이를 아무도 읽지
 * 않는 모바일 — 에서 발광에 곱하는 값.
 *
 * 이게 없으면 그 홈들은 그냥 클리핑된다. 9.6은 세 채널 전부를 1.0 위로 올리므로, 보여 줄
 * 후광이 없는 기기는 밋밋한 흰 선을 얻고 심의 호박색을 통째로 잃는다. 0.245는 패스가
 * half-float으로 가기 전 코어가 갖고 있던 발광량인데, 파란 채널을 다시 4분의 1로 되돌려
 * 홈을 원래 잡아 둔 색으로 되돌린다. 데스크톱 값은 블룸을 전제로 잡은 것이고, 이건 그
 * 부재를 전제로 잡은 것이다.
 */
const CORE_GLOW_UNBLOOMED = 0.245;

const CORE_FRAG_PARS = /* glsl */ `
  varying vec3 vCorePos;
  varying vec3 vCoreNormal;
  uniform sampler2D uStoneMap;
  uniform float uTexScale;
  uniform float uFront;
  uniform float uFull;
  uniform float uTime;
  uniform vec3 uGlowColor;
  uniform vec3 uGlowHi;
  uniform vec3 uCharged;
  uniform vec3 uOverheat;
  uniform vec3 uDormant;
  uniform float uIntensity;
  uniform float uCharge;
  uniform float uChargeGain;
  uniform float uHeat;
  uniform float uHeatGain;
  uniform float uBase;
  uniform float uHot;
  uniform vec3 uSweepDir;
  uniform float uSweepRange;

  vec4 triplanar(sampler2D tex, vec3 p, vec3 n, float scale) {
    vec3 w = pow(abs(n), vec3(4.0));
    w /= max(w.x + w.y + w.z, 0.0001);
    return texture2D(tex, p.zy * scale) * w.x
         + texture2D(tex, p.xz * scale) * w.y
         + texture2D(tex, p.xy * scale) * w.z;
  }
`;

const CORE_FRAG_BODY = /* glsl */ `
  // 훑는 진행도를 막대 정점에 구워 넣지 않고 코어 자체를 통과하며 잰다. 그래서 빛의 전선이
  // 몸통 전체를 가로지르고, 이미 지나온 모든 모서리 홈으로 비쳐 보인다. 방향 하나가 두
  // 크기의 몸통을 모두 담당한다 — 코어 자신의 반너비로 정규화되기 때문이다.
  float vParam = clamp(dot(vCorePos, uSweepDir) / uSweepRange + 0.5, 0.0, 1.0);

  // 오름차순 smoothstep으로 쓰고 뒤집었다. GLSL은 edge0 > edge1일 때 smoothstep을 정의하지
  // 않고, 이 드라이버는 거기서 0을 돌려주지 않는다 — 그래서 유물이 잠들어 있어야 할 동안
  // 코어가 모든 홈을 통해 최대 밝기로 빛났다.
  float travelled = 1.0 - smoothstep(uFront - 0.075, uFront + 0.015, vParam);
  float lit = max(travelled, uFull);
  // 전선이 아직 움직이는 동안 더 밝은 머리가 그 위를 탄다.
  float head = exp(-abs(vParam - uFront) * 42.0) * (1.0 - uFull) * step(0.001, uFront) * step(uFront, 0.999);
  float breathe = 0.94 + 0.06 * sin(uTime * 1.6 + vParam * 22.0);
  float glow = lit * breathe + head * 1.6;
  ${CORE_TEXTURE}

  // 비트 01의 궤적이 조명되는 방식 그대로 조명한다. 같은 영상 안에 도착하는 같은 빛이기
  // 때문이다. 그 케이지는 단지 밝기만 한 게 아니다. 블룸 임계값의 무릎을 넘길 만큼 높은
  // 바닥을 유지하고, 달아오르면서 색조가 옮겨 간다 — 쉴 때는 심의 색, 전선에서는 하이라이트
  // 색 — 그래서 밝기를 올린 표면이 아니라 타고 있는 무언가로 읽힌다. 예전 코어는 숫자
  // 하나로 스케일되는 단색이었고, 그래서 홈들이 케이지의 그 질감을 가진 적이 없었다.
  float coreHot = clamp(head * 1.4 + max(uFull - 0.35, 0.0) * 0.5, 0.0, 1.0);
  vec3 tint = mix(uGlowColor, uGlowHi, coreHot);

  // ── 충전(charge) ──────────────────────────────────────────────────────────────────
  //
  // 회전이 빛에 하는 일: 동시에 **깊어지고** 올라간다.
  //
  // 하중을 지는 쪽은 깊어지는 절반이고, 왜인지 적어 둘 만하다. 레벨만 올리면 눈에 보이는
  // 변화가 없기 때문이다. 9.6에서 심 색의 빨강과 초록은 둘 다 1.0을 한참 넘으므로 홈 자체는
  // 흰색으로 클리핑되고 아무리 더 줘도 흰색으로 남는다 — 더 밝은 흰색은 같은 흰색이다.
  // 색이 살아남는 곳은 채널끼리 아직 벌어져 있는 곳, 즉 후광 바깥이다. 그래서 **보여야 할**
  // 충전은 채널의 크기가 아니라 채널 사이의 비율을 바꿔야 한다.
  //
  // uCharged는 잔불 토큰 — 로그인 버튼이 입고 있는 호박색 — 이고, 심이 쉴 때의 색보다 상당히
  // 채도가 높다. 파랑이 빨강의 20분의 1인데 심은 8분의 1이다. 그쪽으로 섞으면 후광이 창백한
  // 금색에서 버튼의 주황으로 당겨지고, 그 다음 게인이 그 주황을 더 멀리 뻗게 한다.
  tint = mix(tint, uCharged, uCharge);

  // ── 열(heat) ──────────────────────────────────────────────────────────────────────
  //
  // 충전 **대신**이 아니라 충전 **다음에** 적용한다. 둘이 서로 다른 말을 하고, 둘 다 동시에
  // 말할 수 있어야 하기 때문이다. 충전은 회전 하나 — 움직임과 함께 왔다 가는 섬광이다.
  // 열은 굴려진 큐브의 누적된 상태이고, 아무것도 움직이지 않을 때도 남아 있다. 이미 뜨거운
  // 큐브를 돌리면 뜨거운 큐브가 돌아가는 것으로 읽혀야 하는데, 둘을 합성하면 그게 나온다.
  //
  // 자기 게인을 갖고 있고, 필요하다. uOverheat는 앞의 두 색보다 어두워서, 들어 올려 주지
  // 않으면 큐브가 뜨거워질수록 **식는** 것처럼 보인다.
  tint = mix(tint, uOverheat, uHeat);
  vec3 emission = tint
    * mix(uBase, uHot, coreHot)
    * mix(1.0, uChargeGain, uCharge)
    * mix(1.0, uHeatGain, uHeat)
    * uIntensity;

  // 코어는 빛을 낸다. 리그에 반응하지 않는다. unlit 재질의 diffuseColor에 결과를 그대로
  // 쓰는 것이 three에서 순수 휘도 채널에 해당하므로, 홈 안의 빛은 코어가 붙잡은 빛이 아니라
  // **만들고 있는** 빛이다.
  //
  // 그렇더라도 빛을 내지 않는 발광체도 **무언가**이긴 해야 한다. 순수한 검정으로 두면 잠든
  // 코어가 모든 홈을 유물을 뚫고 난 구멍으로 만들어 버렸다. 이제는 판보다 한 단계 어두운
  // 납작한 돌 색을 유지하고, 빛의 전선이 도착하면서 발광이 그걸 덮어 버린다.
  float emit = clamp(glow, 0.0, 1.0);
  diffuseColor.rgb = uDormant * coreGrain * (1.0 - emit) + emission * glow * coreGrain;
`;

export interface SeamMaterial {
  readonly material: THREE.MeshBasicMaterial;
  applyTheme(theme: ResolvedTheme): void;
  setFront(front: number, full: number): void;
  setTime(time: number): void;
  /** 발광 강도. 조명 키프레임이 비트마다 구동한다. */
  setIntensity(value: number): void;
  /**
   * "빛이 방금 무언가를 하도록 요청받았다"의 0…1. 색을 충전된 호박색 쪽으로 깊게 하고
   * 레벨도 함께 올린다. `heroRelic`이 구동한다 — 회전이 여기에 스파이크를 주고, 느린
   * 너울이 이 값이 오래도록 정확히 0인 상태를 막는다.
   */
  setCharge(value: number): void;
  /**
   * "이 물건이 일해 왔다"의 0…1. 충전과 달리 이건 사건이 아니라 **상태**다. 큐브가 도는
   * 동안 쌓이고 안 도는 동안 빠지며, 심을 호박색에서 빨강 쪽으로 데려간다. `heroRelic`이
   * 구동한다.
   */
  setHeat(value: number): void;
  /** 코어가 얼마나 존재하는가(0…1). 주변 판들과 발맞춰 디더링된다. */
  setReveal(value: number): void;
  dispose(): void;
}

/**
 * `glows`는 블룸 패스가 이 재질의 출력을 실제로 읽을지 여부다. 막는 게 아니라 발광량에
 * 곱하는데, 후광이 없는 코어라도 여전히 불 켜진 홈이어야 하기 때문이다 —
 * `CORE_GLOW_UNBLOOMED` 참고.
 */
export function createCoreMaterial(
  halfExtent: number,
  stoneTexture: THREE.Texture,
  glows: boolean,
): SeamMaterial {
  const emissionScale = glows ? 1 : CORE_GLOW_UNBLOOMED;
  const uniforms = {
    uFront: { value: 0 },
    uFull: { value: 0 },
    uTime: { value: 0 },
    uGlowColor: { value: new THREE.Color() },
    uGlowHi: { value: new THREE.Color() },
    uCharged: { value: new THREE.Color() },
    uOverheat: { value: new THREE.Color() },
    uDormant: { value: new THREE.Color() },
    uIntensity: { value: 1 },
    uCharge: { value: 0 },
    /**
     * 완전히 충전된 심이 얼마나 더 밝게 타는가.
     *
     * 깊어짐을 상쇄하고도 남아야 하는데, 1.45로 잡은 첫 시도는 그러지 못했고 그래서 아무
     * 일도 안 일어나는 것처럼 보였다. 충전 색은 쉴 때의 색보다 **어둡다** — 잔불의 빨강이
     * 0.573이고 심은 0.898이다 — 그래서 그쪽으로 섞으면 게인이 올리는 만큼 레벨이 내려간다.
     * 1.45에서 측정한 빨강 채널은 8.45로, 쉴 때의 8.62보다 오히려 살짝 어두웠다. 후광은
     * 채도가 몇 퍼센트 깊어졌을 뿐 전혀 자라지 않았고, 그건 아무 일도 아닌 것으로 읽힌다.
     *
     * 3.2이고, 두 효과가 서로 잡아당기므로 계산을 적어 둘 만하다. 최고 충전 0.81에서 색조는
     * (0.635, 0.250, 0.041)이 되고 레벨은 26.7이 되어, 심은 쉴 때의 (8.62, 4.59, 1.03)에
     * 대해 (16.9, 6.7, 1.1)을 낸다. 빨강은 두 배가 되고 초록은 절반 오르며 파랑은 거의
     * 움직이지 않는다. 채도는 0.88 → 0.94. 그게 원하던 모양이다 — 후광이 자라고 **그
     * 자라남이 주황**이지, 평범한 게인이 데려갈 법한 전체가 흰색으로 씻기는 그림이 아니다.
     */
    uChargeGain: { value: 3.2 },
    uHeat: { value: 0 },
    /**
     * 완전히 과열된 심이 얼마나 더 밝게 타는가.
     *
     * 충전 쪽보다 크고, 같은 이유가 더 심하게 적용된다. `#E0431A`는 심 색의 초록을 겨우
     * 20분의 1, 파랑을 100분의 1 갖고 있어서 끝까지 섞으면 휘도의 3분의 2가 빠진다. 4.0이면
     * 빨강 채널이 쉴 때의 8.6에 대해 대략 28이 되는데 — 후광이 자라면서 빨개지는 것이지
     * 빨개지면서 어두워지는 것이 아니고, 그게 기계가 뜨겁게 도는 것과 꺼지는 것의 차이다.
     */
    uHeatGain: { value: 4.0 },
    // 예전엔 케이지 자신의 바닥과 천장을 여기 그대로 복사했다. 이제 일치하지 않는데 —
    // `CORE_GLOW_BASE` 참고 — 두 발광체가 요구받는 것이 다르기 때문이다. 케이지는 빈
    // 프레임에 그려진 가는 선이라 2.35에서 읽히지만, 코어는 그 자체가 조명된 돌의 홈을 통해
    // 보이므로 여전히 장식이 아니라 빛이려면 그 돌을 충분히 앞질러야 한다.
    uBase: { value: CORE_GLOW_BASE * emissionScale },
    uHot: { value: CORE_GLOW_HOT * emissionScale },
    uStoneMap: { value: stoneTexture },
    uTexScale: { value: 0.42 },
    uSweepDir: { value: SWEEP_DIR.clone() },
    uSweepRange: { value: halfExtent * 2 * SWEEP_DIR.dot(new THREE.Vector3(1, 1, 1)) },
    uReveal: { value: 1 },
  };

  /*
   * 일부러 unlit이다. `MeshStandardMaterial` 코어는 리그에 의해 **조명되고** 있었다. 키와
   * 환경광을 받아서, 빛을 만들어 내는 것이 아니라 슬롯에 앉은 반사 표면으로 읽혔다.
   * `MeshBasicMaterial`은 씬의 모든 조명을 무시하므로 화면에 도달하는 것은 이 셰이더가 쓴
   * 것뿐이다 — 휘도 채널 하나만 구동하는 것과 같다. 그 다음 선택적 블룸이 후광을 준다.
   */
  /*
   * `toneMapped: false`. **메인** 렌더에서 이것을 발광체로 유지하는 것이 이 플래그다.
   *
   * three는 타깃이 캔버스일 때만 톤매핑 청크를 끼우므로 블룸 프리패스는 어차피 이 셰이더의
   * 원본 출력을 봐 왔다. 이 플래그가 정하는 건 프레임 자체가 무엇을 보여 주느냐다. 매핑되면
   * ACES가 9.6을 흰색 아래 어딘가로 되돌리고 홈은 밝게 조명된 모서리가 된다 — 한동안
   * 그렇게 보였던 그림이다. 매핑되지 않으면 1.0 이상이 전부 클리핑되므로 선은 흰색이고 흰색
   * 으로 남으며, 그 주변 후광이 호박색을 실어 나른다. 뜨거운 필라멘트가 하는 일이 그것이고,
   * 케이지 — 톤매핑된 적 없는 순수 `ShaderMaterial` — 가 늘 해 온 일이 그것이다.
   */
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SEAM_VERT_PARS}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvCorePos = position;\nvCoreNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CORE_FRAG_PARS}\n${REVEAL_PARS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${REVEAL_BODY}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${CORE_FRAG_BODY}`);
  };
  material.customProgramCacheKey = () => 'relic-core';

  return {
    material,
    applyTheme(theme) {
      uniforms.uGlowColor.value.copy(theme.colors.seam);
      uniforms.uGlowHi.value.copy(theme.colors.seamHi);
      // 잔불 토큰. 로그인 버튼이 칠해진 호박색이다 — 여기서는 #C8792A, 라이트 테마에서는
      // #B4670F로, 둘이 빛을 받는 같은 재질로 읽힐 만큼 가까운 색이다.
      uniforms.uCharged.value.copy(theme.colors.ember);
      uniforms.uOverheat.value.copy(theme.colors.seamOverheat);
      uniforms.uDormant.value.copy(theme.colors.coreDormant);
      uniforms.uIntensity.value = theme.scalars.seamEmissive;
    },
    setFront(front, full) {
      uniforms.uFront.value = front;
      uniforms.uFull.value = full;
    },
    setTime(time) {
      uniforms.uTime.value = time;
    },
    setIntensity(value) {
      uniforms.uIntensity.value = value;
    },
    setCharge(value) {
      uniforms.uCharge.value = value;
    },
    setHeat(value) {
      uniforms.uHeat.value = value;
    },
    setReveal(value) {
      uniforms.uReveal.value = value;
    },
    dispose() {
      material.dispose();
    },
  };
}

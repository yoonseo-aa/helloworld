import * as THREE from 'three';
import { streamFor } from '../lib/seededRandom';
import type { ResolvedTheme } from '../theme';
import type { SubjectState } from '../story/state';
import type { DeviceTier } from '../lib/deviceTier';

/**
 * 먼지와 꽃가루. 분위기용 파티클 남발이 아니라 이야기에 묶여 있다. 구름은 유물이 깨어나는
 * 만큼만 차오르고, 꽃가루는 비트 03에서 데이지가 벌어지는 동안에만 특별히 떠오른다.
 *
 * 라이트 테마에서는 개수의 60%짜리 저불투명 어두운 꽃가루 알갱이가 된다. 개수를 줄이는 건
 * 인스턴스 인덱스에 대한 셰이더 쪽 컬링이라 버퍼를 다시 만들지 않는다.
 */

const MOTE_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aScale;
  attribute float aIndexNorm;

  varying float vAlpha;

  uniform float uTime;
  uniform float uRise;
  uniform float uDensity;
  uniform float uCountScale;
  uniform float uSize;
  uniform float uDpr;
  uniform float uSpan;
  uniform float uLift;

  void main() {
    if (aIndexNorm > uCountScale) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vAlpha = 0.0;
      return;
    }

    vec3 p = position;
    // 느린 대류: 떠오르고, 감기고, 키 라이트를 가로질러 옆으로 떠돈다.
    float lift = fract((p.y - uLift) / uSpan + 0.5 + uTime * aSpeed * (0.02 + uRise * 0.06)) - 0.5;
    p.y = lift * uSpan + uLift;
    p.x += sin(uTime * 0.35 * aSpeed + aPhase) * 0.28;
    p.z += cos(uTime * 0.27 * aSpeed + aPhase * 1.3) * 0.28;

    // 기둥의 위아래 끝에서 페이드해서, 무엇도 갑자기 나타나거나 사라지지 않게 한다.
    float edgeFade = 1.0 - smoothstep(0.34, 0.5, abs(lift));
    vAlpha = edgeFade * uDensity;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * aScale * uDpr / max(-mvPosition.z, 0.7);
  }
`;

const MOTE_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  uniform sampler2D uSprite;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDay;

  void main() {
    if (vAlpha < 0.008) discard;
    float mask = texture2D(uSprite, gl_PointCoord).a;
    // 클리핑 아래로 유지해서 먼지가 흰 바늘구멍이 아니라 따뜻한 보케로 남게 한다 —
    // 검은 바탕의 흰 점들은 별밭으로 읽히는데, 이 장면에 있어선 안 되는 것이다.
    gl_FragColor = vec4(uColor * mix(0.9, 1.0, uDay), mask * vAlpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface Motes {
  readonly group: THREE.Group;
  update(state: SubjectState, time: number, dpr: number): void;
  applyTheme(theme: ResolvedTheme): void;
  dispose(): void;
}

const SPAN = 3.6;
/** 꽃가루가 밑동이 아니라 정원 주변에 앉도록 기둥을 들어 올린다. */
const COLUMN_LIFT = 0.7;

export function createMotes(tier: DeviceTier, sprite: THREE.Texture): Motes {
  const group = new THREE.Group();
  group.name = 'motes';

  const rng = streamFor('motes');
  const count = tier.counts.motes;

  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const scales = new Float32Array(count);
  const indices = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // 유물에 바싹 붙여 모은다. 이보다 넓게 퍼뜨리면 정원에서 떠오르는 먼지가 아니라
    // 별밭으로 읽히기 시작한다.
    const radius = 0.8 + Math.pow(rng(), 2.2) * 1.5;
    const angle = rng() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (rng() - 0.5) * SPAN + COLUMN_LIFT;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.8;
    phases[i] = rng() * Math.PI * 2;
    speeds[i] = 0.6 + rng() * 1.1;
    scales[i] = 0.5 + rng() * 1.1;
    // 인덱스를 섞어 둬서, 일부만 컬링해도 층을 잘라내는 대신 고르게 성겨진다.
    indices[i] = rng();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aIndexNorm', new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      uSprite: { value: sprite },
      uColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uRise: { value: 0 },
      uDensity: { value: 0 },
      uCountScale: { value: 1 },
      uSize: { value: 22 },
      uDpr: { value: 1 },
      uOpacity: { value: 0.85 },
      uDay: { value: 0 },
      uSpan: { value: SPAN },
      uLift: { value: COLUMN_LIFT },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'motes-points';
  points.frustumCulled = false;
  points.renderOrder = 8;
  group.add(points);

  return {
    group,

    update(state, time, dpr) {
      // 키 라이트를 통과해 떠오르는 꽃가루는 비트 03/04의 사건이다. 그 구간 밖에서는
      // 성기게 유지해서 분위기용 파티클 남발이 되지 않게 한다.
      // `(1 - dissolve * 0.5)` 항은 케이지와 함께 사라졌다. 그려지던 선이 스파크로 부서지는
      // 동안 이 필드를 성기게 만들어서 두 구름이 하나로 읽히지 않게 하던 항이다.
      const density = Math.max(state.pollen * 0.9, state.awakening * 0.22);
      group.visible = density > 0.01;
      if (!group.visible) return;

      material.uniforms.uTime!.value = time;
      material.uniforms.uRise!.value = state.pollen;
      material.uniforms.uDensity!.value = density;
      material.uniforms.uDpr!.value = dpr;
    },

    applyTheme(theme) {
      (material.uniforms.uColor!.value as THREE.Color).copy(theme.colors.moteColor);
      material.uniforms.uOpacity!.value = theme.scalars.moteOpacity;
      material.uniforms.uCountScale!.value = theme.scalars.moteCountScale;
      material.uniforms.uDay!.value = theme.dayAmount;

      const blending = theme.dayAmount < 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (material.blending !== blending) {
        material.blending = blending;
        material.needsUpdate = true;
      }
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}

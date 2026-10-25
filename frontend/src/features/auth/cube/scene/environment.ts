import * as THREE from 'three';
import type { ResolvedTheme } from '../theme';

/**
 * 배경과 이미지 기반 조명. 둘 다 런타임에 생성한다.
 *
 * 배경은 하늘 구체가 아니라 스크린 공간 방사형 그라디언트다. 그래서 토큰 표의
 * "중심 → 가장자리" 감쇠가 카메라 초점거리와 무관하게 구도가 원하는 자리에 정확히
 * 떨어진다. 톤매핑에서 제외되어 있어서, 라이트 테마의 종이 흰색이 ACES에 눌리지 않고
 * 잡아 둔 색 그대로 남는다.
 */

const BACKGROUND_VERT = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const BACKGROUND_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vNdc;
  uniform vec3 uCenter;
  uniform vec3 uEdge;
  uniform float uAspect;
  uniform vec2 uFocus;

  // 정렬 디더 오프셋: LSB 미만의 미세한 흔들림으로, 넓고 대비가 아주 낮은 그라디언트에서
  // 밴딩을 없애면서도 눈에 띄는 노이즈를 만들지 않는다.
  float dither(vec2 fragCoord) {
    return fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 p = vec2((vNdc.x - uFocus.x) * uAspect, vNdc.y - uFocus.y);
    float d = clamp(length(p) * 0.62, 0.0, 1.0);
    float falloff = d * d * (3.0 - 2.0 * d);
    vec3 color = mix(uCenter, uEdge, falloff);
    color += (dither(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface Backdrop {
  readonly mesh: THREE.Mesh;
  /** 그라디언트의 밝은 중심을 피사체 쪽으로 옮긴다(NDC). */
  setFocus(x: number, y: number): void;
  setAspect(aspect: number): void;
  applyTheme(theme: ResolvedTheme): void;
  dispose(): void;
}

export function createBackdrop(): Backdrop {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );

  const material = new THREE.ShaderMaterial({
    vertexShader: BACKGROUND_VERT,
    fragmentShader: BACKGROUND_FRAG,
    uniforms: {
      uCenter: { value: new THREE.Color() },
      uEdge: { value: new THREE.Color() },
      uAspect: { value: 1 },
      uFocus: { value: new THREE.Vector2(0, 0) },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'backdrop';

  return {
    mesh,
    setFocus(x, y) {
      (material.uniforms.uFocus!.value as THREE.Vector2).set(x, y);
    },
    setAspect(aspect) {
      material.uniforms.uAspect!.value = aspect;
    },
    applyTheme(theme) {
      (material.uniforms.uCenter!.value as THREE.Color).copy(theme.colors.bgCenter);
      (material.uniforms.uEdge!.value as THREE.Color).copy(theme.colors.bgEdge);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** 유물이 잠겨 있는 절차적 하늘 — 이 씬의 자연광원이다. */
export interface SkySettings {
  skyTop: string;
  skyHorizon: string;
  ground: string;
  sunColor: string;
  /** 지평선 위의 고도, 도 단위. */
  sunElevation: number;
  /** 나침반 각도(도). 키 라이트의 방위각과 맞춘다. */
  sunAzimuth: number;
  /** 클수록 태양 원반이 좁아진다. */
  sunFocus: number;
  sunStrength: number;
  horizonBlend: number;
}

export const SKY_DEFAULTS: SkySettings = {
  // 사실상 색이 없는 주광. 프로브는 예전에 강하게 따뜻했는데, 돌이 환경광의 대부분을
  // 여기서 받으므로 그 색조가 알베도를 아무리 중성으로 만들어도 유물을 황갈색으로
  // 붙들고 있던 원인이었다.
  skyTop: '#C6C9CC',
  skyHorizon: '#EDEDEB',
  ground: '#343433',
  sunColor: '#FFFDF9',
  sunElevation: 32,
  sunAzimuth: 140,
  sunFocus: 26,
  sunStrength: 0.85,
  horizonBlend: 0.05,
};

export interface Environment {
  readonly texture: THREE.Texture;
  /** 프로브를 제자리에서 다시 만든다. 씬은 계속 같은 슬롯을 가리킨다. */
  rebuild(settings: SkySettings): THREE.Texture;
  dispose(): void;
}

/**
 * 메모리에 작은 정방형(equirectangular) 하늘을 만들고 PMREM을 돌려서 쓸 만한 반사
 * 환경맵을 얻는다. 중성에 가까운 따뜻한 프로브 하나가 두 테마를 모두 담당하고,
 * 낮/밤 차이는 토큰 표의 `scene.environmentIntensity`가 만든다.
 */
export function createEnvironment(renderer: THREE.WebGLRenderer): Environment {
  const width = 128;
  const height = 64;
  const data = new Float32Array(width * height * 4);

  const skyTop = new THREE.Color();
  const skyHorizon = new THREE.Color();
  const ground = new THREE.Color();
  const sun = new THREE.Color();
  const scratch = new THREE.Color();

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let target: THREE.WebGLRenderTarget | null = null;

  const build = (settings: SkySettings): THREE.Texture => {
    skyTop.setStyle(settings.skyTop);
    skyHorizon.setStyle(settings.skyHorizon);
    ground.setStyle(settings.ground);
    sun.setStyle(settings.sunColor);

    const sunPhi = THREE.MathUtils.degToRad(90 - settings.sunElevation);
    const sunTheta = THREE.MathUtils.degToRad(settings.sunAzimuth);

    for (let y = 0; y < height; y++) {
      const phi = (y / (height - 1)) * Math.PI;
      for (let x = 0; x < width; x++) {
        const theta = (x / width) * Math.PI * 2;

        const up = Math.cos(phi);
        scratch.copy(ground).lerp(skyHorizon, THREE.MathUtils.smoothstep(up, -0.55, settings.horizonBlend));
        scratch.lerp(skyTop, THREE.MathUtils.smoothstep(up, settings.horizonBlend, 0.95));

        const dot =
          Math.sin(phi) * Math.sin(sunPhi) * Math.cos(theta - sunTheta) + Math.cos(phi) * Math.cos(sunPhi);
        const blob = Math.pow(Math.max(0, dot), settings.sunFocus);
        scratch.lerp(sun, blob * settings.sunStrength);

        const i = (y * width + x) * 4;
        data[i] = scratch.r;
        data[i + 1] = scratch.g;
        data[i + 2] = scratch.b;
        data[i + 3] = 1;
      }
    }

    const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.colorSpace = THREE.LinearSRGBColorSpace;
    source.needsUpdate = true;

    target?.dispose();
    target = pmrem.fromEquirectangular(source);
    source.dispose();
    return target.texture;
  };

  build(SKY_DEFAULTS);

  return {
    get texture() {
      return target!.texture;
    },
    rebuild: build,
    dispose() {
      target?.dispose();
      pmrem.dispose();
    },
  };
}

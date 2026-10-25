import * as THREE from 'three';
import type { ResolvedTheme } from '../theme';

/**
 * 선택적 블룸. 심 지오메트리와 먼지에만 적용한다.
 *
 * `BLOOM_LAYER`에 있는 오브젝트만 빛을 기여한다. 나머지 메시는 프리패스에서 검게 그려져서
 * 가림은 제대로 한다(유물 반대편의 심이 돌을 뚫고 새어 나올 수 없다). 결과는 완성된 프레임
 * 위에 합성되므로, 화면 전체에 적용되는 것이 없고 모델링이 빛에 가려 사라지지도 않는다.
 *
 * ### 밉 피라미드를 쓰는 이유 — 스케일 두 개로는 감쇠가 안 만들어진다
 *
 * 오랫동안 체인 두 개로 돌았다. 절반 해상도에서 9탭 가우시안 하나, 그 출력을 받아 8분의 1
 * 해상도에서 하나 더. 옥타브 둘은 하나보다 하나 많을 뿐, 여전히 글로우가 아니다. 밝은 선
 * 하나가 또렷한 테두리 **더하기** 납작한 안개판으로 나왔고, 그 사이에 눈에 보이는 틈이
 * 있고 그 틈을 채우는 게 없었다. 그래서 고를 수 있는 그림이 "윤곽선"과 "뿌옇게 씻김"
 * 둘뿐이었고, 튜닝이 그 사이를 계속 왕복한 이유가 정확히 그것이다.
 *
 * three 자신의 `UnrealBloomPass`가 하는 일이자 지금 이 코드가 하는 일은, 같은 하이패스
 * 이미지를 절반씩 줄여 가며 다섯 해상도에서 흐리고 내림차순 가중치로 전부 더하는 것이다.
 * 각 레벨이 앞 레벨보다 넓고 옅은 자락을 얹고, 그 합이 두 개의 뚜렷한 고리가 아니라
 * 매끄러운 감쇠가 된다. 그 중첩이 요령의 전부이고, 부드러운 그림에 다른 비결은 없다.
 *
 * 짚어 둘 결과가 둘 있다. 둘 다 예전엔 우회하던 것이다:
 *
 *   · 에너지. 넓은 블러 하나는 밝은 선 하나를 거의 사라질 만큼 얇게 퍼뜨린다 — 옛 체인은
 *     2.6/255로 측정됐고 보이기라도 하려면 ×42라는 억지 보정이 필요했다. 피라미드는 밝은
 *     핵을 좁은 레벨에 두고 자락만 넓은 레벨에 두므로 그 배수가 사라졌다.
 *   · 임계값이 이제 **한 번**, 자기 패스에서, 어떤 블러보다도 먼저 돈다. 예전에는 첫 블러의
 *     이미 합산된 탭에 적용됐는데 그러면 모든 하이라이트의 자락이 어두워진다 — 흐린
 *     이미지에 임계를 거는 것과 임계 건 이미지를 흐리는 것은 같지 않고, 하이패스인 쪽은
 *     두 번째뿐이다.
 *
 * ### 체인은 HDR이고, 밝은 것을 밝게 만드는 게 바로 그것이다
 *
 * 피라미드를 넣고도 한참 동안 로그인의 홈은 빛이 아니라 창백한 테두리로 읽혔다. 감쇠의
 * 모양은 애초에 문제가 아니었다. **범위**가 문제였다. 이 파일의 모든 타깃이 8비트 sRGB라
 * 프리패스가 `sRGB(min(radiance, 1))`을 썼는데, 코어는 선형으로 약 2.35, 케이지의 뜨거운
 * 모서리는 4.6을 낸다. 전부 같은 255에 떨어졌다. 흰색의 세 배인 발광체와 흰색인 조명받은
 * 돌판이 하이패스에 구별 불가능한 상태로 도착했고, 임계값에는 가를 것이 남지 않았으며
 * 블러에는 퍼뜨릴 것이 남지 않았다. 거기서 `bloomGain`을 올리면 글로우가 아니라 회색
 * 물감이 나오는데, `look.ts`에 쓰이고 다시 쓰인 지적이 정확히 그것이다.
 *
 * 그래서 이제 체인 전체가 선형 공간의 `HalfFloatType`으로 돈다 — `UnrealBloomPass`가 하는
 * 것과 같고, three.js 예제가 이쪽이 안 그러던 시절에도 흰색으로 타 버리던 이유다. 렌더
 * 타깃으로 들어갈 때 톤매핑은 이미 건너뛰어지므로(three는 타깃이 캔버스일 때만 그 청크를
 * 끼운다) 프리패스가 광도를 클램프 없이 담는다. 돌은 0.4 근처가 최고이고 심은 1.3 이상에
 * 앉는다. 이제 그 사이 어디에 임계를 걸어도 둘이 절대적으로 갈리고, 살아남은 것은 평평한
 * 1.0이 아니라 자기 높이를 그대로 블러로 가져간다.
 *
 * ### 다시 내려오기
 *
 * 메인 프레임은 여전히 캔버스로 곧장 그려지고, 늘 그랬듯 three가 톤매핑하고 인코딩한다 —
 * 이 패스는 씬 이미지를 소유하지 않고, 일부러 넘겨받지도 않는다. 그래서 합성 단계가 HDR
 * 후광을 표시 범위로 스스로 내려야 한다. 프레임이 매핑된 것과 같은 ACES 곡선과 같은
 * 노출을 적용한 뒤 인코딩한다. 그게 후광에 흰색으로 포화되는 핵과 매끄럽게 잦아드는 자락을
 * 주는 것이고, 그렇지 않으면 보이지 않거나 클리핑되거나 둘 중 하나인 선형 램프가 된다.
 *
 * 더하기가 아니라 **스크린**으로 블렌딩하는데, 여기가 참조 구현과 갈리는 유일한 지점이다.
 * `UnrealBloomPass`는 HDR 씬 버퍼에 블룸을 더하고 그 합을 한 번 톤매핑하므로, 이미 밝은
 * 돌 위를 지나는 후광이 거기에 대해 압축된다. 톤매핑된 후광을 이미 톤매핑된 프레임에
 * 더하면 그런 여유가 없어서 조명받은 모든 면을 따라 심하게 클리핑된다. 스크린 —
 * `src·(1−dst) + dst` — 은 이 영상의 대부분인 검정에 대해서는 더하기와 동일하고, 더하기가
 * 터질 자리에서 정확히 부드럽게 눕는다.
 */
export const BLOOM_LAYER = 1;

/**
 * 빛나지도 않고 빛을 의미 있게 가리지도 않는 오브젝트들 — 식생, 배경, 접지 그림자, 손.
 * 자기 레이어에 두면 블룸 프리패스에서 아예 빠지는데, 비트 05에서 드로우콜을 아끼는
 * 몫의 대부분이 그것이다.
 */
export const NO_BLOOM_LAYER = 2;

/**
 * 피라미드의 단 수. 첫 단이 절반 해상도이고 그 뒤로 계속 절반씩.
 *
 * 다섯. `UnrealBloomPass`와 같다. 1440 폭 캔버스에서 마지막 단은 45px이라 아홉 탭이 이미
 * 화면 대부분을 덮는다 — 더 넓히면 얻는 것 없이 무엇이 빛나는지 형태만 못 잡게 된다.
 */
const LEVELS = 5;

/** 패스가 도는 동안 렌더러의 클리어 색을 보관한다. `render`의 주석 참고. */
const previousClearColor = new THREE.Color();

/**
 * `radius`가 기울이기 전의 레벨별 가중치.
 *
 * 내림차순이라 좁은 레벨이 핵을 나르고 넓은 레벨은 자락만 나른다. `radius`가 각각을
 * `1.2 - factor` 쪽으로 보간하면서 램프를 뒤집는다 — 0에서 글로우가 선에 달라붙고
 * 1에서 멀리 뻗는다. three가 쓰는 것과 같은 형태이고, 여기서 `radius`가 블러 폭이 아니라
 * **분포** 컨트롤인 이유이기도 하다. 폭은 단 수가 이미 고정한다.
 */
const BLOOM_FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2] as const;

/**
 * 하이패스. 아무것도 흐려지기 전에 전체 해상도 프리패스 위에서 한 번 돈다.
 *
 * 딱 자르지 않고 `smoothstep`을 쓰므로, 무릎 위에 걸친 하이라이트가 튀어나오는 대신 좁은
 * 구간에서 서서히 들어온다. 아래쪽 경계를 임계값에서 고정 폭만큼 끌어내리는데, 그게 램프가
 * 너무 가팔라서 컨트롤이 스위치처럼 느껴지는 걸 막는다.
 *
 * 검사하는 휘도가 이제 sRGB로 인코딩된 바이트가 아니라 선형 광도라서, 임계값이 "흰색보다
 * 몇 배 밝아야 하는가"로 읽힌다 — 1.0이 흰색 자체이고, 잡아 둔 값들이 그 아래에 앉는 건
 * 심이 1.3까지 가기 때문이다. 마스크를 통과한 텍셀은 자기 높이를 그대로 유지하는데,
 * half-float 체인의 핵심이 그것이다. 무릎을 넘은 것은 클리핑된 1이 아니라 2배나 4배로
 * 블룸한다.
 */
const HIGHPASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform float uThreshold;

  void main() {
    vec3 texel = texture2D(uSource, vUv).rgb;
    float luma = dot(texel, vec3(0.2126, 0.7152, 0.0722));
    // 무릎 폭이 임계값에 비례한다. 고정 0.12는 옛 인코딩 범위의 3분의 1이었고, 4.6짜리
    // 발광체 앞에서는 반올림 오차다.
    float knee = smoothstep(uThreshold * 0.78, uThreshold * 1.04, luma);
    gl_FragColor = vec4(texel * knee, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uStep;

  void main() {
    float w[5];
    w[0] = 0.227027; w[1] = 0.194595; w[2] = 0.121622; w[3] = 0.054054; w[4] = 0.016216;

    vec3 sum = texture2D(uSource, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      vec2 offset = uStep * float(i);
      sum += texture2D(uSource, vUv + offset).rgb * w[i];
      sum += texture2D(uSource, vUv - offset).rgb * w[i];
    }
    gl_FragColor = vec4(sum, 1.0);
  }
`;

/**
 * 다섯 단을 전부 더하고, 톤매핑하고, 캔버스용으로 인코딩한다.
 *
 * `uHaze`가 넓은 쪽에 가중치를 더 얹는다. 옛 넓은 체인이 갖고 있던 것과 같은 컨트롤이지만,
 * 이제는 떨어져 나온 안개판을 만들 수 없다 — 올릴 별개의 이미지가 없고, 하나로 이어진
 * 감쇠의 먼 끝만 있다.
 *
 * 곡선은 three 자신의 `ACESFilmicToneMapping`인데, import하지 않고 옮겨 적었다.
 * `ShaderMaterial`이 `toneMapped`를 끄고 캔버스로 렌더할 때는 톤매핑 청크가 끼워지지 않기
 * 때문이다 — 그리고 그건 꺼져 있어야 한다. 안 그러면 three가 결과를 두 번 매핑한다.
 * `uExposure`에는 아래 깔린 프레임이 매핑된 것과 같은 `toneMappingExposure`를 넣어 주므로,
 * 그림을 열어 주는 비트는 그 글로우도 같은 스톱만큼 열어 준다.
 */
const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uLevel0;
  uniform sampler2D uLevel1;
  uniform sampler2D uLevel2;
  uniform sampler2D uLevel3;
  uniform sampler2D uLevel4;
  uniform float uStrength;
  uniform float uRadius;
  uniform float uHaze;
  uniform float uExposure;

  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 acesFilmic(vec3 color) {
    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 ACESOutputMat = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    color *= uExposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }

  // three의 sRGB OETF. bvec mix 대신 step()으로 썼는데, 그래야 GLSL ES 1.00에서
  // 컴파일된다 — ShaderMaterial이 GLSL3를 요청하지 않으면 받는 게 그것이다.
  vec3 encodeSRGB(vec3 color) {
    vec3 low = color * 12.92;
    vec3 high = pow(max(color, vec3(0.0)), vec3(0.41666)) * 1.055 - vec3(0.055);
    return mix(high, low, step(color, vec3(0.0031308)));
  }

  // 기본 가중치의 합으로 정규화한다. 그래야 bloomGain이 체인 하나이던 시절의 의미를
  // 유지한다. 이게 없으면 피라미드의 다섯 단이 옛 기여분의 세 배로 합산되고 look.ts에
  // 잡아 둔 모든 값이 터진 것처럼 읽힌다.
  float weightAt(float factor, float index) {
    return mix(factor, 1.2 - factor, uRadius) * (1.0 + uHaze * index * 0.25) * ${(1 / BLOOM_FACTORS.reduce((a, b) => a + b, 0)).toFixed(4)};
  }

  void main() {
    vec3 sum =
        texture2D(uLevel0, vUv).rgb * weightAt(${BLOOM_FACTORS[0].toFixed(2)}, 0.0)
      + texture2D(uLevel1, vUv).rgb * weightAt(${BLOOM_FACTORS[1].toFixed(2)}, 1.0)
      + texture2D(uLevel2, vUv).rgb * weightAt(${BLOOM_FACTORS[2].toFixed(2)}, 2.0)
      + texture2D(uLevel3, vUv).rgb * weightAt(${BLOOM_FACTORS[3].toFixed(2)}, 3.0)
      + texture2D(uLevel4, vUv).rgb * weightAt(${BLOOM_FACTORS[4].toFixed(2)}, 4.0);
    gl_FragColor = vec4(encodeSRGB(acesFilmic(sum * uStrength)), 1.0);
  }
`;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export interface BloomPass {
  setSize(width: number, height: number): void;
  applyTheme(theme: ResolvedTheme): void;
  /**
   * 직접 덮어쓰기. 개발용 튜닝 패널이 쓴다.
   * `haze`는 넓고 저해상도인 성분이다 — 0이면 그것과 딸린 패스 두 개를 건너뛴다.
   */
  setGlow(strength: number, threshold: number, radius: number, haze: number): void;
  /**
   * 메인 프레임이 톤매핑된 노출값. 후광을 같은 곡선으로 같은 스톱만큼 내리기 위해 필요하다.
   * 이걸 밀면 아래 프레임이 받은 적 없는 빛을 이 패스가 매핑하게 된다.
   */
  setExposure(value: number): void;
  /** 가림 목록을 다시 만든다. 씬 그래프에 메시가 늘거나 줄면 호출한다. */
  refreshOccluders(): void;
  render(camera: THREE.Camera): void;
  dispose(): void;
}

export function createBloomPass(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  enabled: boolean,
): BloomPass {
  // half-float, 그리고 선형. 이 둘은 같이 간다. 타입이 1을 넘는 값이 살아남게 해 주고,
  // 색 공간이 three가 들어오는 길에 인코딩하는 것을 막아 준다. sRGB 타깃이면 패스가 아직
  // 다 쓰지 않은 광도에 전달 함수를 적용하게 되는데, 그러면 범위가 잘리고 하류의 모든
  // 가중합이 어긋난다 — 블러는 평균이고, 인코딩된 값을 평균 내는 것은 빛을 평균 내는 것이
  // 아니다.
  const rtOptions: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  };

  const makeTarget = (depth: boolean): THREE.WebGLRenderTarget => {
    const target = new THREE.WebGLRenderTarget(1, 1, { ...rtOptions, depthBuffer: depth });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    return target;
  };

  /** 씬의 빛나는 지오메트리를 캔버스 전체 해상도로, 가리는 것들은 검게. */
  const bloomTarget = makeTarget(true);
  /** 그 이미지를 절반 해상도에서 한 번 하이패스한 것. 0단에 들어간다. */
  const highPassTarget = makeTarget(false);

  // 각 단은 가로 방향 임시 버퍼와, 합성에 쓰이는 세로 방향 결과를 하나씩 갖는다. 다음 단이
  // 앞 단의 결과를 읽으므로 다운샘플이 공짜다. 큰 텍스처를 작은 타깃에 그리는 것 자체가
  // 이중선형 축소이기 때문이다.
  const scratch: THREE.WebGLRenderTarget[] = [];
  const levels: THREE.WebGLRenderTarget[] = [];
  for (let i = 0; i < LEVELS; i++) {
    scratch.push(makeTarget(false));
    levels.push(makeTarget(false));
  }

  const quadGeometry = new THREE.PlaneGeometry(2, 2);

  const highPassMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: HIGHPASS_FRAG,
    uniforms: {
      uSource: { value: bloomTarget.texture },
      uThreshold: { value: 0.85 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const blurMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: {
      uSource: { value: null },
      uStep: { value: new THREE.Vector2() },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const compositeMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uLevel0: { value: levels[0]!.texture },
      uLevel1: { value: levels[1]!.texture },
      uLevel2: { value: levels[2]!.texture },
      uLevel3: { value: levels[3]!.texture },
      uLevel4: { value: levels[4]!.texture },
      uStrength: { value: 0.45 },
      uRadius: { value: 0.3 },
      uHaze: { value: 0 },
      uExposure: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    // 더하기가 아니라 스크린 — 파일 맨 위 주석 참고. `src·(1−dst) + dst`는 프레임이
    // 검은 곳에서는(대부분이 그렇다) 더하기와 같고, 검지 않은 곳에서는 클리핑 대신
    // 압축한다.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    // 캔버스에는 흐트러뜨릴 알파 채널이 없다. 위의 색 계수가 알파에도 재사용되도록 두지
    // 않고 그렇다고 명시한다.
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    transparent: true,
  });

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

  // 빛은 가려야 하지만 빛을 기여하면 안 되는 메시들.
  const occluders: THREE.Mesh[] = [];
  const originalMaterials: (THREE.Material | THREE.Material[])[] = [];

  let strength = 0.45;
  /** 각 단의 픽셀 크기. 블러 스텝이 그 크기에서 정확히 한 텍셀이 되도록. */
  const sizes: { w: number; h: number }[] = Array.from({ length: LEVELS }, () => ({ w: 1, h: 1 }));

  const refreshOccluders = (): void => {
    occluders.length = 0;
    originalMaterials.length = 0;
    scene.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh && !(node as THREE.Points).isPoints) return;
      const object = node as THREE.Mesh;
      if (object.layers.isEnabled(BLOOM_LAYER)) return;
      if (object.layers.isEnabled(NO_BLOOM_LAYER)) return;
      occluders.push(object);
      originalMaterials.push(object.material);
    });
  };

  return {
    setSize(w, h) {
      // 이 패스를 아예 안 돌리는 등급은 모든 타깃을 태어날 때의 1×1로 두므로 아무것도
      // 할당하지 않는다. 예전엔 읽지도 않을 캔버스 크기 8비트 프리패스를 그 등급에
      // 물렸는데, half-float에서는 그게 두 배가 된다 — 그걸 제일 감당 못 하는 등급에서.
      // `render`도 같은 플래그로 일찍 빠져나가므로, 여기서 크기를 안 잡아도 하류에서
      // 그걸 찾는 것은 없다.
      if (!enabled) return;

      // 프리패스는 캔버스 전체 해상도를 유지한다. 머리카락 같은 홈을 해석해야 하는 유일한
      // 단이고, 거기서 반으로 줄이면 피라미드가 퍼뜨릴 기회를 갖기도 전에 디테일을
      // 버리는 것이 된다.
      bloomTarget.setSize(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));

      for (let i = 0; i < LEVELS; i++) {
        const scale = 1 / 2 ** (i + 1);
        const lw = Math.max(1, Math.floor(w * scale));
        const lh = Math.max(1, Math.floor(h * scale));
        sizes[i] = { w: lw, h: lh };
        scratch[i]!.setSize(lw, lh);
        levels[i]!.setSize(lw, lh);
        if (i === 0) highPassTarget.setSize(lw, lh);
      }
    },

    applyTheme(theme) {
      strength = theme.scalars.bloomStrength;
      highPassMaterial.uniforms.uThreshold!.value = theme.scalars.bloomThreshold;
      compositeMaterial.uniforms.uStrength!.value = strength;
      compositeMaterial.uniforms.uRadius!.value = theme.scalars.bloomRadius;
    },

    setGlow(nextStrength, threshold, nextRadius, nextHaze) {
      strength = nextStrength;
      highPassMaterial.uniforms.uThreshold!.value = threshold;
      compositeMaterial.uniforms.uStrength!.value = nextStrength;
      compositeMaterial.uniforms.uRadius!.value = nextRadius;
      compositeMaterial.uniforms.uHaze!.value = nextHaze;
    },

    setExposure(value) {
      compositeMaterial.uniforms.uExposure!.value = value;
    },

    refreshOccluders,

    render(camera) {
      if (!enabled || strength <= 0.001) return;
      if (occluders.length === 0) refreshOccluders();

      const previousTarget = renderer.getRenderTarget();
      // 프리패스와 피라미드의 모든 단은 불투명한 검정 클리어를 원하고, 예전엔 그냥 그렇게
      // 설정하고 놔뒀다 — 프레임이 배경 메시에 반드시 덮인다는 보장이 있는 동안에는 보이지
      // 않는 문제였다. 지금은 그 보장이 없다. 배경을 끈 호스트는 클리어가 투명하게 유지되는
      // 것에 기대는데, 블룸 프레임 한 번이면 캔버스가 그 세션 내내 조용히 불투명 검정이
      // 되어 버린다. 그래서 가정하지 않고 가져왔다가 되돌려 놓는다.
      const previousClearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(previousClearColor);

      for (let i = 0; i < occluders.length; i++) occluders[i]!.material = blackMaterial;

      // 프리패스는 빛나는 지오메트리와, 그것을 가려야 하는 돌만 본다.
      const restoreLayers = camera.layers.mask;
      camera.layers.set(0);
      camera.layers.enable(BLOOM_LAYER);

      renderer.setRenderTarget(bloomTarget);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);

      camera.layers.mask = restoreLayers;
      for (let i = 0; i < occluders.length; i++) occluders[i]!.material = originalMaterials[i]!;

      // 흐리기 전에 첫 단 크기에서 하이패스를 한 번.
      quad.material = highPassMaterial;
      renderer.setRenderTarget(highPassTarget);
      renderer.render(quadScene, quadCamera);

      // 그 다음이 피라미드다. 각 단이 윗단을 절반 크기 타깃으로 흐려 넣으므로 다운샘플에
      // 추가 비용이 없다 — 큰 텍스처를 작은 타깃에 쓰는 것이 곧 이중선형 축소이고, 그게
      // 점 샘플링으로 건너뛸 때 생기는 각진 체크무늬로부터 넓은 단들을 지켜 준다.
      quad.material = blurMaterial;
      let source = highPassTarget.texture;
      for (let i = 0; i < LEVELS; i++) {
        const { w: lw, h: lh } = sizes[i]!;

        blurMaterial.uniforms.uSource!.value = source;
        (blurMaterial.uniforms.uStep!.value as THREE.Vector2).set(1 / lw, 0);
        renderer.setRenderTarget(scratch[i]!);
        renderer.render(quadScene, quadCamera);

        blurMaterial.uniforms.uSource!.value = scratch[i]!.texture;
        (blurMaterial.uniforms.uStep!.value as THREE.Vector2).set(0, 1 / lh);
        renderer.setRenderTarget(levels[i]!);
        renderer.render(quadScene, quadCamera);

        source = levels[i]!.texture;
      }

      renderer.setRenderTarget(previousTarget);
      quad.material = compositeMaterial;
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCamera);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
    },

    dispose() {
      bloomTarget.dispose();
      highPassTarget.dispose();
      for (const target of scratch) target.dispose();
      for (const target of levels) target.dispose();
      quadGeometry.dispose();
      highPassMaterial.dispose();
      blurMaterial.dispose();
      compositeMaterial.dispose();
      blackMaterial.dispose();
      occluders.length = 0;
      originalMaterials.length = 0;
    },
  };
}

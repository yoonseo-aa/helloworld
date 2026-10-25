import * as THREE from 'three';
import type { DeviceTier } from '../lib/deviceTier';

export interface RendererBundle {
  readonly renderer: THREE.WebGLRenderer;
  /** 등급 상한을 적용한 뒤의 실효 DPR. 리사이즈마다 갱신된다. */
  readonly state: { dpr: number; width: number; height: number };
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  tier: DeviceTier,
  /**
   * 호스트가 자기 배경을 그리고 큐브는 그 위에 합성만 해야 할 때 true.
   *
   * 드로잉 버퍼에 알파 채널이 생기고, 프레임을 배경 그라디언트가 아니라 아무것도 없는
   * 상태로 지운다. 기본이 꺼짐인 이유는 불투명 버퍼가 어느 드라이버에서든 더 싸고(합성기가
   * 뒤 페이지 위로 블렌딩하는 단계를 건너뛸 수 있다), 이 코드를 잡은 랜딩 페이지가 자기
   * 배경을 직접 그리기 때문이다.
   */
  transparent = false,
): RendererBundle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier.name === 'desktop',
    alpha: transparent,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    stencil: false,
  });

  if (transparent) renderer.setClearColor(0x000000, 0);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // 전역으로 켜 두지만, 실제로 쓰이는 건 키 라이트에 `castShadow`가 설정된 동안뿐이고
  // 스테이지는 그걸 식물이 심긴 비트로 제한한다. `autoUpdate`를 켜 두는 이유는 정원이
  // 애니메이션되기 때문이다 — 바람이 모든 잎을 움직이므로 캐시된 뎁스맵은 어긋난다.
  renderer.shadowMap.enabled = true;
  // 이 버전에서 PCFSoftShadowMap은 폐기 예정이고 조용히 PCF로 폴백된다. 그래서 동작하는
  // 소프트 섀도 설정처럼 보이게 두지 않고 명시적으로 이름을 적었다.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = true;
  // `render()`마다가 아니라 프레임당 한 번만 리셋한다. 그래야 `renderer.info`가 블룸
  // 프리패스와 합성까지 포함한 그 프레임의 진짜 총계를 보고한다.
  renderer.info.autoReset = false;

  const state = { dpr: 1, width: 1, height: 1 };

  const resize = (width: number, height: number): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap);
    state.dpr = dpr;
    state.width = width;
    state.height = height;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
  };

  return {
    renderer,
    state,
    resize,
    dispose() {
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

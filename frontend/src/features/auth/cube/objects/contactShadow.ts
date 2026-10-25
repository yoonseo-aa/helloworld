import * as THREE from 'three';
import type { ResolvedTheme } from '../theme';
import type { SubjectState } from '../story/state';
import { lerp } from '../lib/math';

/**
 * 바닥에 놓였다는 신호: 유물 아래 평면에 깔리는 부드러운 타원 그림자.
 *
 * 라이트 테마에서는 이게 실제로 일을 한다 — 따뜻한 종이 위의 창백한 돌 큐브는 이것 없이는
 * 그냥 떠 있다 — 그래서 불투명도가 뒷생각이 아니라 일급 토큰이고(낮 0.42, 밤 0.15),
 * 3×3×3이 조립되는 동안 유물의 크기를 따라간다.
 */
/** 접지 그림자의 배치와 무게. 개발용 튜닝 패널에 노출한다. */
export interface ShadowSettings {
  opacityScale: number;
  spreadRelic: number;
  spreadAssembly: number;
  heightRelic: number;
  heightAssembly: number;
  offsetX: number;
  offsetZ: number;
}

/**
 * 비트 05의 라이트 테마에 대고 `?tune` 패널에서 잡은 값이다. 거기서는 이 그림자가 접지를
 * 혼자 감당한다. 더 좁고 가까운 그림자는 접촉으로 읽히고, 이것이 대체한 더 넓고 낮은
 * 그림자는 얼룩으로 읽혔다. 불투명도를 조금 올린 건 발자국이 작아진 것을 보상해서 토큰이
 * 요구하는 시각적 무게를 유지하기 위해서다.
 */
/**
 * 여기 있는 건 시작값일 뿐이다. 실제 높이와 크기는 조명 키프레임에서 온다 —
 * `story/look.ts`의 `shadowHeight` 참고. `stage.ts`가 `opacityScale`과 `offsetX`를 뺀
 * 나머지 필드를 매 프레임 덮어쓴다.
 */
export const SHADOW_DEFAULTS: ShadowSettings = {
  opacityScale: 1.12,
  spreadRelic: 3.8,
  spreadAssembly: 5.6,
  heightRelic: -1.8,
  heightAssembly: -3.15,
  offsetX: 0.15,
  offsetZ: 1.15,
};

export interface ContactShadow {
  readonly mesh: THREE.Mesh;
  update(state: SubjectState): void;
  applyTheme(theme: ResolvedTheme): void;
  setSettings(settings: ShadowSettings): void;
  dispose(): void;
}

export function createContactShadow(texture: THREE.Texture): ContactShadow {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    color: 0x000000,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'contact-shadow';
  mesh.renderOrder = -1;
  mesh.position.y = -1.62;

  let themeOpacity = 0.15;
  const settings: ShadowSettings = { ...SHADOW_DEFAULTS };

  return {
    mesh,

    update(state) {
      // 유물의 발자국보다 조금 크게 잡고 카메라 쪽으로 살짝 민다. 키 라이트가 그림자를
      // 뒤쪽 오른쪽으로 던지므로, 이 편향이 없으면 어두운 핵이 큐브 뒤에 숨어서 오브젝트가
      // 떠 있는 것으로 읽힌다 — 라이트 테마가 감당할 수 없는 단 하나가 그것이다.
      const spread = lerp(settings.spreadRelic, settings.spreadAssembly, state.assembly);
      mesh.scale.set(spread, 1, spread * 0.86);
      // 비트 02와 05에서 카메라가 지평선 위 11°밖에 안 되므로, 유물 밑면과 같은 높이의
      // 그림자는 완전히 유물 뒤에 가려진다. 아래로 내리고 카메라 쪽으로 밀면 실루엣 아래에
      // 앞쪽 자락이 드러나는데, 접지 일을 실제로 하는 게 거기다.
      mesh.position.set(
        settings.offsetX,
        lerp(settings.heightRelic, settings.heightAssembly, state.assembly),
        settings.offsetZ,
      );
      material.opacity = themeOpacity * settings.opacityScale * state.shadowAmount;
      mesh.visible = material.opacity > 0.004;
    },

    applyTheme(theme) {
      themeOpacity = theme.scalars.shadowOpacity;
    },

    setSettings(next) {
      Object.assign(settings, next);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}

import * as THREE from 'three';
import { CAMERA, CAMERA_FOV } from '../story/state';

/**
 * 카메라 하나, 자리 하나.
 *
 * 예전엔 이동했다. 비트별 키프레임 사이를 잇는 2차 곡선이 피사체를 가로지르지 않도록 바깥쪽으로
 * 불룩하게 휘었고, 각 구도에 속도 0으로 도착했으며, 세로 화면 재프레이밍과 오프닝 제스처가
 * 아직 화면 중앙에 있는 동안 구도 오프셋을 상쇄하는 `introCentering` 항까지 있었다. 전부
 * 한 장면에서 다른 장면으로 가기 위해 존재했는데, 장면이 하나다.
 *
 * 그래서 리그는 이제 애니메이션이 아니라 **레이아웃 단계**다. 계산하는 모든 것이 뷰포트의
 * 함수이므로 리사이즈 때 계산하고 그 뒤로는 건드리지 않는다. 매 프레임 도는 `update`는
 * 곡선·키프레임 블렌드·근평면 가드와 함께 사라졌다. 그 가드는 눈을 피사체의 바운딩 스피어
 * 바깥으로 잡아 두는 것이었는데, 2.9짜리 구에서 13.1유닛 떨어진 지금은 막을 것이 없다.
 */

const scratchDir = new THREE.Vector3();

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  setViewport(width: number, height: number, isPortrait: boolean): void;
  /** 배경의 밝은 중심이 앉을 자리(NDC). 구도를 따라다닌다. */
  readonly focus: THREE.Vector2;
  /** 구도 이동(뷰포트 비율). +1이면 피사체를 화면 폭만큼 왼쪽으로 옮긴다. */
  readonly composition: { left: number; down: number };
  dispose(): void;
}

/**
 * 피사체가 프레임 안 어디에 앉는가. 호스트마다 다르다.
 *
 * 원래 잡아 둔 오프셋은 큐브를 한참 왼쪽으로 민다. 이 구도를 잡은 페이지가 오른쪽에 로그인
 * 칼럼을 두기 때문이다. 그건 **그 레이아웃**에 대한 사실이지 오브젝트에 대한 사실이 아니다.
 * 가운데 정렬된 카드나 정사각 패널에 넣으면 같은 오프셋이 큐브를 가장자리로 밀어붙이는데,
 * 읽는 사람은 그 이유를 짐작할 수 없다. 그래서 인자로 뺐고, 기본값은 이 값을 잡았을 때의 구도다.
 */
export interface CameraRigOptions {
  /** 구도 이동(뷰포트 비율). +x는 피사체를 왼쪽으로, +y는 아래로. */
  readonly offset?: readonly [number, number];
  /** 같은 것의 세로 화면용(0.85:1보다 좁을 때). 이때 리그는 뒤로도 물러난다. */
  readonly portraitOffset?: readonly [number, number];
  /**
   * 피사체를 몇 배 크게 그릴지. 1이 원래 프레이밍이고 2면 두 배 크기다.
   *
   * dolly가 아니라 **초점거리**로 적용하는데, 그 차이가 이 주석을 쓸 만한 이유 전부다.
   * 눈을 앞으로 옮겨도 피사체가 커지긴 하지만, 동시에 원근이 벌어진다 — 가까운 모서리가
   * 먼 모서리보다 빨리 커지고, 윗면이 짧아지고, 리그와 키 각도와 판의 모따기를 전부
   * 판단했던 그 3/4 뷰가 더는 판단했던 그 뷰가 아니게 된다. 같은 자리에서 긴 렌즈를 쓰면
   * 확대만 되고 나머지는 그대로다 — 투영이 동일하고 더 좁게 잘릴 뿐이다.
   *
   * 겉보기 크기는 `1/tan(fov/2)`에 비례하므로, fov를 나누는 게 아니라 풀어서 구한다.
   */
  readonly zoom?: number;
}

export function createCameraRig(options: CameraRigOptions = {}): CameraRig {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 120);

  const focus = new THREE.Vector2(0, 0);
  const composition = { left: 0, down: 0 };
  const target = new THREE.Vector3(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);
  const landscapeOffset = options.offset ?? CAMERA.offset;
  const portraitOffset = options.portraitOffset ?? CAMERA.mobile.offset;
  const zoom = Math.max(0.1, options.zoom ?? 1);

  /** 같은 자리에서 피사체를 `base`의 `zoom`배 크기로 그리는 fov. */
  const zoomedFov = (base: number): number => {
    if (zoom === 1) return base;
    const half = THREE.MathUtils.degToRad(base) * 0.5;
    return THREE.MathUtils.radToDeg(Math.atan(Math.tan(half) / zoom) * 2);
  };

  return {
    camera,
    focus,
    composition,

    setViewport(nextWidth, nextHeight, isPortrait) {
      const width = Math.max(1, nextWidth);
      const height = Math.max(1, nextHeight);

      camera.position.set(CAMERA.position[0], CAMERA.position[1], CAMERA.position[2]);
      camera.fov = zoomedFov(CAMERA_FOV);

      if (isPortrait) {
        // 세로 화면은 잘라내지 않고 다시 잡는다. 시선 벡터를 따라 뒤로 물러나면서 화각을
        // 조금 넓혀서, 좁은 뷰포트 안에서도 피사체가 실루엣 전체를 유지하게 한다.
        scratchDir.copy(camera.position).sub(target).multiplyScalar(CAMERA.mobile.distanceScale);
        camera.position.copy(target).add(scratchDir);
        camera.fov = zoomedFov(CAMERA_FOV / CAMERA.mobile.focalScale);
      }

      camera.aspect = width / height;
      camera.lookAt(target);

      const offset = isPortrait ? portraitOffset : landscapeOffset;
      const offsetX = offset[0] ?? 0;
      const offsetY = offset[1] ?? 0;
      composition.left = offsetX;
      composition.down = offsetY;

      if (Math.abs(offsetX) < 1e-4 && Math.abs(offsetY) < 1e-4) {
        camera.clearViewOffset();
      } else {
        camera.setViewOffset(width, height, offsetX * width, -offsetY * height, width, height);
      }

      // 구도가 피사체를 어디에 두든, 배경의 따뜻한 중심이 그 뒤에 계속 있도록 맞춘다.
      focus.set(-offsetX * 2, offsetY * 2);
      camera.updateProjectionMatrix();
    },

    dispose() {
      camera.clearViewOffset();
    },
  };
}

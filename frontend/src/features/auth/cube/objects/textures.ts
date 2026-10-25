import * as THREE from 'three';
import { SEED } from '../lib/seededRandom';
import { clamp01 } from '../lib/math';

/**
 * 이 프로젝트의 모든 텍스처는 여기서 런타임에, 시드 노이즈와 캔버스 2D 드로잉으로 만든다.
 * 내려받는 것은 없고, 어떤 맵도 테마 색을 담지 않는다. 맵은 중성(그레이스케일/마스크)이라
 * 같은 GPU 업로드가 두 테마를 모두 담당하고, 테마를 바꿔도 텍스처를 다시 올리지 않는다.
 */

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas-2d-unavailable');
  return { canvas, ctx };
}

/** 감싸인 격자 위의 밸류 노이즈. 그래야 모든 맵이 이음매 없이 타일링된다. */
function tileableNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const hash = (ix: number, iy: number): number => {
    const wx = ((ix % period) + period) % period;
    const wy = ((iy % period) + period) % period;
    let n = (Math.imul(wx, 0x27d4eb2d) ^ Math.imul(wy, 0x165667b1) ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0x85ebca6b) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const n00 = hash(xi, yi);
  const n10 = hash(xi + 1, yi);
  const n01 = hash(xi, yi + 1);
  const n11 = hash(xi + 1, yi + 1);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

function tileableFbm(x: number, y: number, basePeriod: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  let period = basePeriod;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    value += amplitude * tileableNoise(x * freq, y * freq, period, seed + o * 1013);
    total += amplitude;
    amplitude *= 0.5;
    freq *= 2;
    period *= 2;
  }
  return value / total;
}

function commonTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 유물의 표면 데이터. RGBA 맵 하나에 담아서 돌 재질이 축마다 삼중평면 페치를 한 번씩만
 * 하면 되게 한다:
 *   R — 큰 단위의 판 음영 (넓은 타일, 모따기된 모서리)
 *   G — 미세한 결 / 다공성
 *   B — 사용하지 않음
 *   A — 판의 홈 마스크 (어둡게 하는 데와 러프니스에 함께 쓴다)
 */
export function createStoneSurfaceTexture(size = 512): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const data = image.data;


  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // 연속적인 노이즈 필드 딱 두 개뿐이다. 예전에 여기 있던 딱딱한 경계의 패턴들 —
      // 홈과 모따기가 있는 판 격자, 어긋나게 배치된 비늘 줄 — 은 같은 맵이 스물일곱 개
      // 몸통의 여섯 판에 감기는 순간 타일링이 눈에 보였고, 돌이 아니라 인쇄된 천으로
      // 읽혔다.
      const grain = tileableFbm(u * 34, v * 34, 34, 4, SEED ^ 0x77c1);
      const macro = tileableFbm(u * 3, v * 3, 3, 4, SEED ^ 0x1d0b);

      const rValue = clamp01(0.3 + macro * 0.62);
      const gValue = clamp01(grain * 0.76 + 0.12);

      const i = (y * size + x) * 4;
      data[i] = Math.round(rValue * 255);
      data[i + 1] = Math.round(gValue * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  // 파란 채널은 비워 둔다. 시드 랜덤 워크로 그린 머리카락 같은 균열망을 담고 있었는데,
  // 이제 아무도 샘플링하지 않는다.

  return commonTexture(canvas, false);
}

/**
 * 삭제됨: 이끼 카드.
 *
 * 지표 식생을 대신하던 납작한 카드용 알파 마스크 실루엣이었다. 그 카드들은 이제
 * `BroadLeafGroundClump` 로제트 — 실제 스윕 지오메트리 — 라서 이 텍스처에 소비자가 없다.
 * 캔버스 하나가 줄면 부팅 때 텍스처 업로드도 하나 준다.
 */

/** 먼지, 꽃가루, 와이어프레임 스파크에 쓰는 부드러운 원형 스프라이트. */
export function createMoteTexture(size = 64): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = commonTexture(canvas, false);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * 접지 그림자: 핵이 진한 타원형 감쇠. 라이트 테마에서는 이게 주된 접지 신호라, 넓고 고른
 * 블러가 아니라 핵을 좁게 유지한다.
 */
export function createContactShadowTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size - 0.5) * 2;
      const v = (y / size - 0.5) * 2;
      const d = Math.sqrt(u * u + v * v);
      const core = Math.pow(clamp01(1 - d / 0.55), 1.6);
      const halo = Math.pow(clamp01(1 - d), 2.4);
      const alpha = clamp01(core * 0.75 + halo * 0.55);

      const i = (y * size + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = commonTexture(canvas, false);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * 삭제됨: 커밋 밀도 텍스처.
 *
 * 돌의 윗면과 식재 산포가 같은 숫자를 읽도록 `commitDensity()`를 구워 두던 것이다. 두
 * 소비자 모두 사라졌다. `commitDensity()` 자체는 `lib/seededRandom.ts`에 남겨 뒀다 —
 * 이 프로젝트의 기여 필드이자 영상 전체가 딛고 선 은유라, 다음에 그걸 표현할 무언가를
 * 위해 계속 쓸 수 있게 둔다.
 */

/** 스테이지가 한 번 할당하고 정리할 때 놓는 것 전부. */
export interface TextureSet {
  readonly stone: THREE.CanvasTexture;
  readonly mote: THREE.CanvasTexture;
  readonly shadow: THREE.CanvasTexture;
}

export function createTextureSet(): TextureSet {
  return {
    stone: createStoneSurfaceTexture(),
    mote: createMoteTexture(),
    shadow: createContactShadowTexture(),
  };
}

export function disposeTextureSet(set: TextureSet): void {
  set.stone.dispose();
  set.mote.dispose();
  set.shadow.dispose();
}

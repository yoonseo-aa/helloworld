/**
 * 프로젝트 전체가 쓰는 단 하나의 결정론적 시드. 무작위가 등장하는 모든 곳 —
 * 지금 남은 건 돌 표면 노이즈와 먼지의 흐름뿐이다 — 이 상수에서 파생되므로,
 * 새로고침해도 항상 같은 그림이 나온다.
 */
export const SEED = 0x5eed_1a3f;

/** 작고 빠르고 분포가 고른 32비트 PRNG (mulberry32). */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 마스터 시드에서 독립적인 스트림을 파생시킨다. 서브시스템마다 자기 스트림을 가져가므로,
 * 한쪽에서 인스턴스를 늘리거나 줄여도 다른 쪽 배치가 밀리지 않는다.
 */
export function streamFor(name: string): () => number {
  let h = SEED >>> 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  }
  return makeRandom(h);
}

/** [min, max) 범위의 균등 분포 값. */
export function range(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** [0, 1] 범위의 결정론적 2D 밸류 노이즈. 커밋 밀도 필드에 쓴다. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const h = (ix: number, iy: number): number => {
    let n = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 0x85ebca6b) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);

  const n00 = h(xi, yi);
  const n10 = h(xi + 1, yi);
  const n01 = h(xi, yi + 1);
  const n11 = h(xi + 1, yi + 1);

  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

/**
 * "커밋 밀도" 필드: 깃허브 잔디 칸을 큐브 윗면 위의 7행 격자로 그대로 옮긴 것.
 * `u`/`v`는 [0, 1]이고, 결과값 [0, 1]이 돌 셰이더의 판 음영과 식생이 얼마나 빽빽하게
 * 뿌려지는지를 함께 결정한다.
 */
const COMMIT_GRID = 7;

export function commitDensity(u: number, v: number): number {
  const cell = valueNoise2D(Math.floor(u * COMMIT_GRID) * 0.73, Math.floor(v * COMMIT_GRID) * 0.91, SEED);
  const drift = valueNoise2D(u * 2.4, v * 2.4, SEED ^ 0x9e37) * 0.45;
  return Math.min(1, Math.max(0, cell * 0.7 + drift * 0.8 - 0.08));
}

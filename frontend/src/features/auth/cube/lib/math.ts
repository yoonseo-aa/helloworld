/** 스토리·카메라·오브젝트 계층이 함께 쓰는 작은 수치 헬퍼들. */

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** `v`를 [a, b] 구간에서 [0, 1]로 정규화한다. 범위를 벗어나면 잘린다. */
export function inverseLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : clamp01((v - a) / (b - a));
}

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = inverseLerp(edge0, edge1, v);
  return t * t * (3 - 2 * t);
}

/** 더 부드러운 에르미트 곡선 — 양 끝에서 1차 도함수는 물론 **2차 도함수도** 0이다. */
export function smootherstep(edge0: number, edge1: number, v: number): number {
  const t = inverseLerp(edge0, edge1, v);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 프레임레이트에 영향받지 않는 지수 접근. `lambda`가 속도이고, 클수록 빨리 수렴한다.
 * 생 `lerp(a, b, 0.1)` 대신 이걸 쓰는 이유는 30fps에서든 144fps에서든 거동이 같아야
 * 하기 때문이다.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** 루빅 줄 회전이 제자리에 붙을 때 쓰는, 넘어갔다 오지 않는 스냅 이징. */
export function easeOutBack(t: number): number {
  const c1 = 1.20158;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 35mm 환산 초점거리를 three.js의 세로 화각(도)으로 바꾼다. */
export function focalToFov(focalMm: number): number {
  const sensorHeightMm = 24;
  return (2 * Math.atan(sensorHeightMm / (2 * focalMm)) * 180) / Math.PI;
}

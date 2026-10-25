/** 런타임 성능 판정: 인스턴스 수, 포스트프로세싱 단계, DPR 상한을 고른다. */

export type TierName = 'desktop' | 'mobile';

export interface DeviceTier {
  readonly name: TierName;
  readonly dprCap: number;
  readonly postfx: boolean;
  readonly shadowSoftness: number;
  /** 키 라이트가 드리우는 그림자의 뎁스맵 해상도. */
  readonly shadowMapSize: number;
  readonly counts: {
    readonly motes: number;
  };
}

const DESKTOP: DeviceTier = {
  name: 'desktop',
  dprCap: 2,
  postfx: true,
  shadowSoftness: 1,
  // 8유닛짜리 절두체를 덮을 때 월드 1유닛당 약 256텍셀이 된다. 0.0105 굵기의 풀잎 하나가
  // 대략 세 텍셀로 잡혀서 실제로 그림자를 드리울 수 있는 수준이다.
  shadowMapSize: 2048,
  // 케이지가 부서지는 순간을 이제 스파크가 혼자 감당하는데(후광 리본이 사라졌다), 그게
  // 흩뿌림으로 읽히느냐 점 몇 개로 읽히느냐를 이 개수가 결정한다. 대체된 후광이 여기서
  // 315포인트를 썼으므로 사실상 공짜에 가깝다.
  //
  // 식물 개수는 초원 오브젝트가 들어오면서 대략 한 자릿수 줄었는데, 필드는 오히려 더
  // 빽빽해졌다. 예전에는 인스턴스 하나가 풀잎 하나 또는 납작한 카드 하나였고 지금은
  // 통째로 한 다발 혹은 로제트 하나다. 열두 잎짜리 다발 420개면 풀잎 오천 개이고,
  // 이건 낱장 3,600개를 대체하면서 다발마다 실루엣을 갖는다 — 예전 필드는 절대 가질 수
  // 없던 것이다.
  counts: { motes: 900 },
};

const MOBILE: DeviceTier = {
  name: 'mobile',
  dprCap: 1.75,
  postfx: false,
  shadowSoftness: 0.85,
  shadowMapSize: 1024,
  counts: { motes: 380 },
};

export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return DESKTOP;

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 700;
  const fewCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;

  return coarse || narrow || fewCores ? MOBILE : DESKTOP;
}

/**
 * 이름으로 등급을 고른다. 판정에 맡기지 않고 직접 정하고 싶은 호스트를 위한 것.
 *
 * 있어야 하는 이유가 구체적이다. 위의 판정은 **뷰포트**를 보는데, 큐브가 곧 페이지이던
 * 시절에는 뷰포트 크기와 기기 성능이 같은 얘기였으므로 타당했다. 임베드하면 아니다 —
 * 1000×620 노트북 창에 420px 큐브를 넣으면 `< 700` 조건에 걸려 mobile로 떨어지고,
 * mobile 등급이 제일 먼저 하는 일이 글로우 패스를 끄는 것이다. 심이 안 빛나게 되는데,
 * 그게 이 오브젝트의 대부분이고, 기기 성능은 그걸 요구한 적이 없다.
 *
 * 자기가 뭘 그리는지 아는 호스트는 직접 말할 수 있어야 한다. 단, 이건 품질 슬라이더가
 * 아니라 실제 비용이다 — 폰에서 `'desktop'`을 강제하면 안티앨리어싱, DPR 2배 상한,
 * 5단 블룸 피라미드가 일부러 제외해 둔 하드웨어 위에 얹힌다.
 */
export function tierFor(name: TierName): DeviceTier {
  return name === 'mobile' ? MOBILE : DESKTOP;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 호버 가능한 포인터가 있을 때만 참. 포인터 추적을 켤지 여부를 가른다. */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

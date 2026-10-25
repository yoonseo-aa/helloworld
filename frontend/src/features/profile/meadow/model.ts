// 성장 초원 필드 모델 — Profile.dc.html mkField()의 1:1 포팅 (렌더링 무관, 순수 계산).
// ⚠️ 난수 호출 순서가 시안과 동일해야 같은 시드에서 같은 초원이 나옵니다. 수정 시 주의.
import { PLANT_META } from './field-defs';
import { levelOf, window53 } from '../contributions';

export interface FieldCell { w: number; d: number; n: number; date: string; x: number; y: number }

export interface PlantCand {
  bg: boolean; dep: number; fg: boolean; rk: number;
  px: number; py: number; sx: number; sy: number;
  op: number; opL: number; opD: number;
  s: number; e: number; x: number; bd: number; bu: number; hp: number;
  href: string; s1: string; s2: string; s3: string; la: string; lb: string; hr: string;
  j1: [number, number]; j2: [number, number]; j3: [number, number];
  grass: boolean; hasHead: boolean;
}

/** 스프링·성장 상태를 포함한 전경 식물 (엔진이 매 프레임 갱신) */
export interface PlantItem {
  c: PlantCand; x: number; s: number; e: number; grass: boolean;
  px: number; py: number; sx: number; sy: number;
  i1: string; i2: string; i3: string; ia: string; ib: string; ih: string | null;
  j1: [number, number]; j2: [number, number]; j3: [number, number];
  w1: [number, number]; w2: [number, number]; w3: [number, number];
  wa: [number, number]; wb: [number, number]; wh: [number, number];
  spin: number; lean: number; amp: number;
  /** 은은한 바람: wph=위상 지연, wam=진폭(키·이삭 유무 가중) */
  wph: number; wam: number;
  b1: number; b2: number; b3: number; b4: number; bm: number;
  v1: number; v2: number; v3: number; v4: number; vm: number;
  tt: number; hot: boolean; live: boolean;
  sy1: number; sy2: number; sy3: number; sla: number; slb: number; syh: number; sch: number;
  k: number; d: number; elOp: number; o2: number; o3: number; oh: number; done: boolean;
}

export interface BgItem { c: PlantCand; id: string; px: number; py: number; sx: number; sy: number; bd: number; bu: number; dep: number }

export interface Firefly {
  i: number; rk: number; band: number; bx: number; by: number;
  gp: number; spin: number; rmin: number; ph: number;
  r: number; cr: number; gr: number; gry: number; sr: number; sry: number;
  nx: { fdx: number; fdy: number; flyDur: number; flyDel: number; bobDur: number; bobDel: number; flickDur: number; flickDel: number; fdur: number; fdel: number; brot: number; bsc: number };
  _glow?: { cvs: HTMLCanvasElement; w: number; h: number };
}

export interface FieldModel {
  cells: FieldCell[];
  cand: PlantCand[];
  plants: PlantItem[]; // 전경(스프링 대상), s 오름차순
  bgItems: BgItem[];   // 배경(블룸 후 베이크)
  fgItems: BgItem[];   // 전경 매트(식물 위에 그림)
  ff: Firefly[];       // 밀도 필터 적용 후
  total: number; actR: number; best: number; cons: number; vigor: number; hot: number;
  dens: number; commits: number; cnt: number;
  reduce: boolean;
}

export type DensityPreset = 'auto' | 'steady' | 'heavy' | 'burst';

/** 시안과 동일한 mulberry32 계열 시드 난수 */
function mkRand(seed: number) {
  let sd = seed;
  return () => {
    sd |= 0; sd = (sd + 0x6d2b79f5) | 0;
    let t = Math.imul(sd ^ (sd >>> 15), 1 | sd);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 활동 패턴 테스트 프리셋 → 371칸 커밋 배열 (auto는 null: 실데이터/시드 더미 사용) */
export function scenarioCounts(p: DensityPreset): number[] | null {
  if (p === 'auto') return null;
  const r = mkRand(p === 'steady' ? 71237 : p === 'heavy' ? 90211 : 33517);
  const out: number[] = [];
  for (let i = 0; i < 371; i++) {
    if (p === 'steady') out.push(r() < 0.93 ? 1 + Math.floor(r() * 2.4) : 0);
    else if (p === 'heavy') out.push(r() < 0.95 ? 6 + Math.floor(r() * 11) + (r() < 0.16 ? 7 : 0) : 0);
    else out.push(r() < 0.28 ? 4 + Math.floor(r() * 20) : 0);
  }
  return out;
}

const PT_RE = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/;
const jxy = (s: string): [number, number] => {
  const m = PT_RE.exec(s || '');
  return m ? [+m[1], +m[2]] : [0, 0];
};

export function buildFieldModel(opts: {
  /** 371칸 커밋 배열 — 없으면 시드 기반 더미 생성 */
  counts?: number[] | null;
  seed: number;
  reduce: boolean;
  /** 밀도 산정용 커밋 수 — 없으면 total 사용 (타 유저 프로필은 API의 commit_count 전달) */
  commitsHint?: number;
}): FieldModel {
  const { counts, seed, reduce } = opts;
  const r = mkRand(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const rng = (a: number, b: number) => a + r() * (b - a);
  const WK = 53;
  const win = window53();
  const src = counts && counts.length ? counts : (() => {
    const out: number[] = [];
    for (let w = 0; w < WK; w++) {
      const season = 0.52 + 0.48 * Math.sin((w / WK) * Math.PI * 2 - 1.1);
      for (let dd = 0; dd < 7; dd++) {
        const weekend = dd === 0 || dd === 6 ? 0.42 : 1;
        const spike = r() < 0.07 ? 1.9 : 1;
        out.push(Math.max(0, Math.round(r() * 13 * season * weekend * spike - 1.2)));
      }
    }
    return out;
  })();

  const cells: FieldCell[] = [];
  let tot = 0, act = 0, hotN = 0;
  for (let i = 0; i < WK * 7; i++) {
    const w = Math.floor(i / 7), dd = i % 7, n = Math.min(99, Math.max(0, src[i] | 0));
    tot += n;
    const lv = levelOf(n);
    if (lv > 0) { act++; if (lv >= 4) hotN++; }
    cells.push({ w, d: dd, n, date: win[i], x: 42 + w * 29, y: 116 + dd * 29 });
  }
  const hot = act ? hotN / act : 0;
  const N = WK * 7;
  let lo1N = 0, loN = 0, midN = 0, hi4N = 0, hi5N = 0, best = 0, run0 = 0;
  for (let i = 0; i < N; i++) {
    const lv = levelOf(Math.min(99, Math.max(0, src[i] | 0)));
    if (lv > 0) {
      run0++; if (run0 > best) best = run0;
      if (lv === 1) lo1N++; else if (lv === 2) loN++; else if (lv === 3) midN++; else if (lv === 4) hi4N++; else hi5N++;
    } else run0 = 0;
  }
  loN += lo1N;
  const actR = act / N;
  const cons = Math.min(1, actR * 1.12 + Math.min(1, best / 45) * 0.2);
  const sLo = act ? loN / act : 0.34, sMid = act ? midN / act : 0.33, sHot = act ? hotN / act : 0.33;
  let wG = Math.pow(sLo, 1.5) * 0.88, wM = sMid * 1.6 + 0.1, wO = sHot * 2.4 + 0.08;
  const wS = wG + wM + wO; wG /= wS; wM /= wS; wO /= wS;
  const lvSum = lo1N + loN * 2 + midN * 3 + hi4N * 4 + hi5N * 5;
  const vigor = act ? Math.min(1, Math.max(0, (lvSum / act - 1) / 3.4)) : 0.4;
  const scAll = 0.93 + vigor * 0.3;
  const flMul = 0.75 + (sMid * 0.8 + sHot * 1.1);
  const flCap = 0.46 + Math.min(0.24, sHot * 0.3);
  const warmP = Math.min(0.62, 0.4 + sHot * 0.22); // 콘플라워+양귀비 합계 비중
  const cornP = 0.42; // 그중 콘플라워 (나머지 양귀비)
  const whiteP = 0.5; // 나머지 꽃 중 흰 데이지(d2) — 커밋이 많아도 흰 데이지가 섞이도록

  const M = PLANT_META;
  const TUFT = ['t1', 't2', 't4', 't4', 't3', 't1', 't4', 't2', 't3', 't4'];
  const MAT = ['f1', 't1', 'f6', 'f2', 't4', 'f5', 'f7', 't2', 'f4', 'f1', 't3', 'f2', 'f6', 't4', 'f1', 'f7', 'f3', 'f1', 't2', 'f4', 'f6', 'f1', 't1', 'f7'];
  const HEM = ['f3', 'f4', 'f6', 't4', 'f3', 'f5', 'f4', 'f3', 'f6', 'f7', 'f3', 'f4', 'f6', 'f3', 't4', 'f5'];
  const CORN = ['c1', 'c2', 'c3'], POPPY = ['p1', 'p2', 'p3'], GOLDD = ['d1', 'd3'], LEAFY = ['l1', 'l2', 'l3'], GRASS = ['w1', 'w2', 'w3', 'w4'], BRANCH = ['b1', 'b2', 'b3'];
  const START: Record<string, [number, number]> = { flower: [0.28, 0.54], leafy: [0.1, 0.32], grass: [0.14, 0.38], branch: [0.22, 0.46], tuft: [0.04, 0.2] };
  const layers = [
    { n: 88, pool: [GRASS, GRASS, LEAFY, BRANCH], fl: 0.08, sc: [0.72, 0.96] as const, op: 0.8 },
    { n: 68, pool: [GRASS, LEAFY, BRANCH, GRASS], fl: 0.46, sc: [0.86, 1.1] as const, op: 0.92 },
    { n: 52, pool: [LEAFY, GRASS, BRANCH, GRASS], fl: 0.66, sc: [0.96, 1.26] as const, op: 1 },
    { n: 72, pool: [GRASS, GRASS, BRANCH, GRASS], fl: 0.18, sc: [0.44, 0.7] as const, op: 0.98 },
    { n: 164, pool: [GRASS], fl: 0, sc: [0.8, 1.55] as const, op: 0.92 },
    { n: 76, pool: [GRASS], fl: 0, sc: [0.8, 1.46] as const, op: 0.58 },
  ];
  const cand: PlantCand[] = [];
  layers.forEach((L, Li) => {
    const slot = 1540 / L.n, isMat = Li >= 4;
    const BULK: Record<string, number> = { l1: 2.2, l2: 2.1, l3: 1.9, l4: 1.5, l5: 1.2, f1: 0.9, f2: 1.1, f3: 0.5, f4: 0.5, f5: 0.7, f6: 1, f7: 0.8, d1: 2, d2: 2, d3: 1.6, c1: 2, c2: 1.8, c3: 1.5, p1: 1.8, p2: 1.6, p3: 1.3, b1: 1.3, b2: 1.2, b3: 1, w1: 0.8, w2: 0.8, w3: 0.7, w4: 0.7, t1: 0.6, t2: 0.6, t3: 0.6, t4: 0.5 };
    const THIN = GRASS.concat(BRANCH, GRASS);
    let run = 0;
    for (let k = 0; k < L.n; k++) {
      const gk = Li === 0 ? 0.95 : Li === 1 ? 0.6 : Li === 2 ? 0.3 : Li === 3 ? 1.1 : 2.2;
      const tA = wG * gk, tB = wM, tC = wO, tS = tA + tB + tC;
      const tr = r() * tS;
      const tier = tr < tA ? 0 : tr < tA + tB ? 1 : 2;
      const isFlower = tier === 0 ? false : r() < Math.min(flCap, L.fl * flMul * (tier === 2 ? 1 : 0.8));
      const m0 = isMat
        ? pick(Li === 5 ? HEM : r() < 0.62 ? MAT : TUFT)
        : isFlower
          ? (r() < warmP ? (r() < cornP ? pick(CORN) : pick(POPPY)) : (r() < whiteP ? 'd2' : pick(GOLDD)))
          : tier === 0 ? pick(pick([GRASS, LEAFY, GRASS, BRANCH]))
          : tier === 2 ? pick(pick([GRASS, LEAFY, LEAFY, GRASS, BRANCH]))
          : pick(pick(L.pool.concat([LEAFY])));
      let mSel = m0;
      if (!isMat && !isFlower && run > 5.4 && (BULK[mSel] || 1) > 1.7) mSel = pick(THIN);
      run = run * 0.55 + (BULK[mSel] || 1);
      let m = mSel;
      const MD0 = M[mSel];
      const kind = isMat ? 'tuft' : isFlower ? 'flower' : LEAFY.indexOf(m) >= 0 ? 'leafy' : GRASS.indexOf(m) >= 0 ? 'grass' : 'branch';
      const deepG = tier === 0 && ((k * 37 + Li * 23) % 100) < (isMat ? 55 : 50); // 짙은 초록 비율 — 시안 값
      const sfx = tier === 0 ? (deepG ? 'GD' : 'G') : '';
      const x = 30 + slot * (k + 0.5) + (r() - 0.5) * slot * (isMat ? 1.7 : 1.02);
      let sc = rng(L.sc[0], L.sc[1]) * scAll * (MD0.k || 1);
      if (r() < 0.1) sc *= 1.26;
      if (isMat) sc *= 0.7 + Math.pow(r(), 2.4) * 0.92;
      const syM = tier === 0 ? rng(0.9, 0.97) : 1;
      if (LEAFY.indexOf(m) >= 0) {
        const RHM: Record<string, number> = { l1: 98.6, l2: 89.4, l3: 75.9, l4: 78, l5: 43 };
        sc *= 0.74 + Math.pow(r(), 1.15) * 1.95;
        const hR0 = RHM[m] * sc * syM, soft = 128 * scAll, cap = 247 * scAll;
        let lf = 1;
        if (hR0 > soft) lf = (soft + (hR0 - soft) * 0.48) / hR0;
        if (hR0 * lf > cap) lf = cap / hR0;
        sc *= lf;
        const hR = hR0 * lf;
        const want = hR < 60 ? 'l5' : hR < 108 ? (r() < 0.58 ? 'l4' : 'l3') : m;
        if (want !== m) { m = want; sc = hR / (RHM[m] * syM); }
      }
      if (tier === 2) sc *= 1.06;
      const flip = r() < 0.5;
      const fgPick = isMat ? r() : 1;
      const sxJ = isMat ? rng(0.88, 1.16) : rng(0.85, 1.18);
      const st = START[kind];
      const s = rng(st[0], st[1]);
      const e = Math.min(0.995, Math.max(s + 0.07, s + rng(0.14, 0.26) * (isMat ? 0.5 : GRASS.indexOf(m) >= 0 ? 0.7 : 1)));
      const u = r();
      const MD = M[m];
      const still = Li === 0 || Li >= 4 || (Li === 3 && !isFlower) || (!isFlower && sc * MD.H < 96);
      const grass = GRASS.indexOf(m) >= 0;
      const hAbs = MD.H * sc * syM;
      const alt = Math.min(1, Math.max(0, (hAbs - 38) / 190));
      const bigMat = isMat && hAbs > 62; // 큰 잔디 다발은 겹치지 않게 맨 뒤로
      const dep = bigMat ? 0 : still ? (Li === 4 ? (fgPick < 0.26 ? 3 : fgPick < 0.6 ? 2 : 0) : Li === 5 ? (fgPick < 0.42 ? 3 : 2) : Li === 0 ? 0 : Li === 3 || hAbs < 74 ? 1 : 2) : 3;
      const depM = dep === 0 ? rng(0.3, 0.44) : dep === 1 ? rng(0.48, 0.66) : dep === 2 ? rng(0.72, 0.9) : 1;
      cand.push({
        bg: still, dep, fg: still && Li >= 4 && dep === 3,
        rk: isFlower ? 0.2 + 0.8 * u : u,
        px: +x.toFixed(1), py: 338.5,
        sx: +(flip ? -sc * sxJ : sc * sxJ).toFixed(3), sy: +(sc * syM).toFixed(3),
        op: still ? L.op : 1,
        opL: still ? +(L.op * depM * (1 - 0.24 * alt)).toFixed(3) : 1,
        opD: still ? +(L.op * depM * (0.78 + 0.22 * alt)).toFixed(3) : 1,
        s: +s.toFixed(3), e: +e.toFixed(3), x: +x.toFixed(1),
        bd: +(0.03 + r() * 1.32).toFixed(3), bu: +(0.46 + r() * 0.42).toFixed(3),
        hp: +hAbs.toFixed(1),
        href: m + 'f' + sfx,
        s1: m + '1' + sfx, s2: m + '2' + sfx, s3: m + '3' + sfx,
        la: m + 'a' + sfx, lb: m + 'b' + sfx, hr: m + 'h' + sfx,
        j1: jxy(MD.j1), j2: jxy(MD.j2), j3: jxy(MD.j3),
        grass, hasHead: MD.head,
      });
    }
  });

  // 반딧불이 21마리 (밀도로 노출 수 제어)
  const ff: Firefly[] = [];
  for (let i2 = 0; i2 < 21; i2++) {
    const gr = rng(40, 74), dx = +rng(60, 150).toFixed(0), dy = +(-rng(10, 30)).toFixed(0);
    const band = i2 % 3;
    const bx = Math.round(rng(90, 1510)), by = Math.round(rng(96, band === 2 ? 316 : 286));
    const nrm = i2 / 20;
    const fdur = +rng(0.5, 0.86).toFixed(2), fdel = +(-rng(0, 0.9)).toFixed(2);
    const flyDur = rng(6.5, 12), flyDel = -rng(0, 24);
    const bobDur = rng(4, 9), bobDel = -rng(0, 8), flickDur = rng(4.5, 9), flickDel = -rng(0, 8);
    const bsc = band === 0 ? rng(0.5, 0.62) : band === 1 ? rng(0.62, 0.8) : rng(0.8, 1.02);
    const brot = +rng(-13, 13).toFixed(0);
    ff.push({
      i: i2, rk: i2 / 21, band, bx, by,
      gp: 0.55 + (i2 % 5) * 0.13, spin: (i2 % 2 ? -1 : 1) * (0.16 + (i2 % 4) * 0.06),
      rmin: 14 + Math.sqrt(nrm) * 46, ph: i2 * 1.618,
      r: +rng(0.8, 1.35).toFixed(2), cr: +rng(3.4, 5.6).toFixed(1),
      gr: +gr.toFixed(0), gry: +(gr * rng(0.6, 0.84)).toFixed(0),
      sr: +(gr * 1.06).toFixed(0), sry: +(gr * 0.74).toFixed(0),
      nx: { fdx: dx, fdy: dy, flyDur, flyDel, bobDur, bobDel, flickDur, flickDel, fdur, fdel, brot, bsc },
    });
  }

  const commits = Math.min(99999, Math.max(0, (opts.commitsHint ?? tot) | 0));
  const dens = Math.min(1, 0.18 + cons * 0.74 + Math.min(0.14, (commits / 1500) * 0.14));

  // 밀도 필터 + 전경/배경 분리 (시안 plantsNow / initField와 동일)
  const vis = cand.filter((p) => p.rk <= dens + 1e-6);
  const bgF = vis.filter((p) => p.dep === 0), bgM = vis.filter((p) => p.dep === 1), bgN = vis.filter((p) => p.dep === 2), bgG = vis.filter((p) => p.bg && p.dep === 3);
  const toBg = (c: PlantCand): BgItem => ({ c, id: c.href, px: c.px, py: c.py, sx: c.sx, sy: c.sy, bd: c.bd, bu: c.bu, dep: c.dep });
  const bgAll = bgF.concat(bgM, bgN, bgG).map(toBg);
  const fgItems = bgAll.filter((b) => b.c.fg);
  const bgItems = bgAll.filter((b) => !b.c.fg);
  const plants: PlantItem[] = vis.filter((p) => !p.bg).map((c, i) => {
    const s = c.s, e = c.e, span = e - s, g = c.grass;
    return {
      c, x: c.x, s, e, grass: g,
      px: c.px, py: c.py, sx: c.sx, sy: c.sy,
      i1: c.s1, i2: c.s2, i3: c.s3, ia: c.la, ib: c.lb, ih: c.hasHead ? c.hr : null,
      j1: c.j1, j2: c.j2, j3: c.j3,
      w1: g ? [s + span * 0.16, s + span * 0.46] : [s, s + span * 0.34],
      w2: g ? [s + span * 0.4, s + span * 0.68] : [s + span * 0.3, s + span * 0.64],
      w3: g ? [s + span * 0.62, s + span * 0.88] : [s + span * 0.6, s + span * 0.9],
      wa: g ? [s, s + span * 0.3] : [s + span * 0.3, s + span * 0.56],
      wb: g ? [s + span * 0.12, s + span * 0.42] : [s + span * 0.58, s + span * 0.84],
      wh: [s + span * 0.84, Math.min(1, e + 0.06)],
      spin: (i % 2 ? -1 : 1) * (28 + (i % 5) * 6),
      lean: ((i * 7 + (c.hp | 0)) % 2 ? -1 : 1) * (0.7 + ((i * 5) % 7) * 0.42) * Math.min(1, Math.max(0.15, ((c.hp || 60) - 42) / 90)),
      amp: Math.max(0.45, Math.min(1, 1.22 - (c.hp || 90) / 200)) * ((c.hp || 90) < 48 ? 0.3 : 1),
      wph: (i % 23) * 0.869 + (i % 7) * 0.41,
      wam: Math.min(1, Math.max(0.18, ((c.hp || 60) - 36) / 128)) * (c.hasHead ? 1.12 : 1),
      b1: 0, b2: 0, b3: 0, b4: 0, bm: 0, v1: 0, v2: 0, v3: 0, v4: 0, vm: 0, tt: 0, hot: false, live: false,
      sy1: 0.001, sy2: 0.001, sy3: 0.001, sla: 0.001, slb: 0.001, syh: 0.02, sch: 0.02,
      k: 0.03 + (i % 7) * 0.0032, d: 0.062 + (i % 5) * 0.006,
      elOp: 0, o2: 0, o3: 0, oh: 0, done: false,
    };
  });
  plants.sort((a, b) => a.s - b.s);

  const ffOn = ff.filter((f) => f.rk <= 0.2 + dens * 0.8);

  const model: FieldModel = {
    cells, cand, plants, bgItems, fgItems, ff: ffOn,
    total: tot, actR, best, cons, vigor, hot,
    dens, commits, cnt: vis.length, reduce,
  };
  applyModelTheme(model, false);
  return model;
}

/** 테마에 따른 배경 식물 불투명도 적용 (시안 plantsNow의 opL/opD 선택) */
export function applyModelTheme(model: FieldModel, dark: boolean) {
  for (const p of model.cand) p.op = p.bg ? (dark ? p.opD : p.opL) : 1;
}

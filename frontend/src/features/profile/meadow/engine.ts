// 성장 초원 캔버스 엔진 — Profile.dc.html 로직 클래스의 렌더링/애니메이션 부분 1:1 포팅.
// 프레임워크 무관 클래스. React 바인딩은 MeadowField.tsx가 담당합니다.
//
// 파이프라인: field-defs의 SVG 심볼 → (getBBox 측정) → 오프스크린 아틀라스 래스터라이즈 →
//   매 프레임 canvas 2D로 식물 세그먼트를 관절 회전(스프링)과 함께 드로잉.
// 애니메이션: 성장(startGrow 3.2s) · 포인터 스프링(springLoop) · 반딧불이 유영/홀드-어트랙트(ffLoop) ·
//   배경 블룸 후 정적 베이크(bakeBG) · 다크모드 글로우.
import { applyModelTheme, type BgItem, type FieldModel, type Firefly } from './model';

interface FFNode {
  f: Firefly; band: number; bx: number; by: number;
  gp: number; spin: number; rmin: number; ph: number;
  x: number; y: number; vx: number; vy: number; rt: number; rsp: number; turn: number;
  boost: number; face: number; hold: number; lastFx: number | null;
}
interface Atlas { cvs: HTMLCanvasElement; meta: Record<string, { x: number; y: number; w: number; h: number; ax: number; ay: number }>; S: number; blur?: HTMLCanvasElement | null }

const RAD = Math.PI / 180;

/**
 * 스프라이트 경계 상자 캐시 (symbol id → bbox).
 *
 * getBBox()는 호출할 때마다 SVG 레이아웃을 강제한다. 아틀라스 하나에 스프라이트가
 * 260여 개라 그 자체로 수십 ms짜리 **끊을 수 없는 작업**이 되고, 테마 전환·재마운트로
 * 아틀라스를 다시 구울 때마다 처음부터 반복했다(개발 모드 StrictMode에서는 진입 한 번에
 * 두 번 돈다). 도형은 정적이라 한 번 잰 값을 계속 쓰면 된다 — 두 번째부터는 0에 가깝다.
 */
const BBOX_CACHE = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * SVG defs 원본 마크업과, 테마별로 CSS 변수를 실제 색으로 치환해 둔 결과.
 *
 * 아틀라스를 구울 때마다 defs를 outerHTML로 통째로 직렬화하고 그 위에 정규식을 다섯 번
 * 돌렸다(변수 치환 2회 + id·href·url 재작성 3회). var() 하나마다 getPropertyValue도 불렀다.
 * 마크업은 정적이고 색은 테마당 한 벌뿐이라 매번 다시 만들 이유가 없다.
 */
/**
 * 구운 아틀라스 캐시 — **모듈 수준**이다(엔진 인스턴스가 아니라).
 *
 * 아틀라스를 만드는 데 드는 비용의 대부분은 브라우저가 SVG를 파싱·디코딩하는 시간이고
 * (210KB 문서, 우리 JS가 아니라 이미지 파이프라인이라 쪼갤 수도 없다), 그게 50~80ms짜리
 * 롱태스크로 잡힌다. 인스턴스마다 캐시를 들고 있으면 재마운트할 때마다 이걸 다시 문다 —
 * 개발 모드 StrictMode는 진입 한 번에 두 번, 프로필을 오갈 때마다 또 한 번.
 * 모듈에 두면 세션당 테마별로 한 번만 굽는다.
 *
 * 항목 하나가 캔버스 한 장(대략 1900x1540 = 12MB)이라 상한을 2로 둔다 — 라이트·다크면 충분하다.
 */
const ATLAS_CACHE = new Map<string, Atlas>();
/**
 * 굽는 중인 아틀라스 — 같은 키를 동시에 두 번 굽지 않게 한다.
 *
 * 굽기는 비동기(SVG 디코딩)라, 첫 결과가 캐시에 들어가기 전에 두 번째 엔진이 생기면
 * 캐시가 비어 보여서 똑같은 걸 또 굽는다. 개발 모드 StrictMode의 이중 마운트가 정확히
 * 그 경우고, 그래서 롱태스크도 두 벌씩 찍혔다. 진행 중인 작업이 있으면 그 결과를 함께 쓴다.
 */
const ATLAS_INFLIGHT = new Map<string, Promise<Atlas>>();
const ATLAS_CACHE_MAX = 2;

let RAW_DEFS: string | null = null;
const DEFS_CACHE = new Map<string, { plain: string; deep: string }>();

export class MeadowEngine {
  private reduce: boolean;
  private onGrown: (g: boolean) => void;
  private f: HTMLCanvasElement | null = null;      // field canvas
  private defsEl: SVGSVGElement | null = null;     // 숨김 defs 호스트
  private model: FieldModel | null = null;
  private modelV = 0;
  private dark = false;
  private active = false;                          // 섹션 리빌 후 자동 성장 허용
  private vis = true;
  private grown = false;
  private growing = false;
  private p: number | null = null;                 // 성장 진행도 0..1
  private dirty = true;
  private rect: DOMRect | null = null;
  private atlas: Atlas | null = null;
  private atlasKey: string | null = null;
  private atlasBusy = false;
  /** 아틀라스 캐시 — 테마 토글 때 SVG 재래스터+명암/림 패스를 다시 돌지 않도록 키(light|dark|modelV)별로 보관 */
  /**
   * 가장 먼 배경(dep 0)에 쓰는 **블러를 미리 입힌 아틀라스 사본**.
   *
   * 예전엔 그 항목들을 그릴 때마다 ctx.filter = blur(...)를 걸었다. 캔버스 필터는
   * 드로우마다 별도 레이어를 만드는 연산이라 단가가 일반 drawImage와 비교가 안 되는데,
   * 배경이 한 장으로 구워지기 전 2.5초 동안 프레임마다 180여 개를 그렇게 그렸다
   * (60fps면 초당 1만 회 넘는 블러 드로우) — 프로필 진입 직후 렉의 원인이었다.
   *
   * 아틀라스를 통째로 한 번만 흐리게 만들어 두고 dep 0은 이쪽에서 퍼 온다. 결과 픽셀은
   * 같고 필터는 사라진다. 반경이 1.1*S인 이유: 아틀라스 1px은 화면에서 u/S px이 되므로
   * 화면 기준 1.1*u를 만들려면 아틀라스 기준으로 1.1*S여야 한다(u가 약분돼 사라진다).
   * 스프라이트 사이 여백이 PAD 6 * S(8~14px)라 이 반경으로는 서로 번지지 않는다.
   */
  /** 프레임당 리베이크 1개 예산 — 테마 전환처럼 여러 베이크가 동시에 무효화될 때 한 프레임에 몰리지 않게 나눈다 */
  /**
   * 리베이크를 프레임에 나눠 굽는 잡. 테마를 바꾸면 그림자·배경·전경 베이크가 동시에 무효화되는데
   * 하나가 200~350ms라 한 프레임에 몰면 눈에 보이게 끊긴다. 프레임당 ~5ms만 진행하고
   * 부분 완성된 캔버스를 그대로 그려서 앞(그림자) → 뒤(배경·전경) 순서로 채워 넣는다.
   */
  private shdJob: { key: string; cvs: HTMLCanvasElement; cx: CanvasRenderingContext2D; items: Array<{ c?: { hp?: number; dep?: number }; sx?: number; px?: number; py?: number }>; i: number } | null = null;
  private bgJob: { key: string; cvs: HTMLCanvasElement; c: CanvasRenderingContext2D; list: BgItem[]; i: number } | null = null;
  private fgJob: { key: string; cvs: HTMLCanvasElement; c: CanvasRenderingContext2D; list: BgItem[]; i: number } | null = null;
  private static SLICE_MS = 5;
  /**
   * 초원 렌더 상한(fps). 바람에 흔들리는 느린 연출이라 30fps로도 눈에 차이가 거의 없는데,
   * 커밋이 많은 계정은 프레임당 drawImage가 200회를 넘고 식물마다 save/rotate/scale이
   * 6~10회씩 더 붙어서, 60fps로 돌리면 그 비용이 그대로 두 배가 된다.
   * 시간 누적(driftMs)은 매 rAF마다 벽시계로 계속 쌓으므로 프레임을 걸러도 바람 위상은
   * 어긋나지 않는다 — 느려지는 게 아니라 성기게 그릴 뿐이다.
   */
  private static FIELD_FPS = 30;
  /** 배경 개화가 끝나는 시각(초) = 지연 최대(bd 1.35) + 길이 최대(bu 0.88). 이후로는 한 장으로 굽는다. */
  private static BLOOM_S = 2.23;
  private divCol: string | null = null;
  private bloomT0: number | null = null;
  private xf: HTMLCanvasElement | null = null;   // 테마 전환용 직전 프레임 스냅샷
  private xfT0 = 0;
  private shdKey: string | null = null;
  private shdBake: HTMLCanvasElement | null = null;
  private driftMs = 0;
  private ffOp = 0;
  private ffLong = false;
  // rafs / timers
  private fRaf: number | null = null; private fLast = 0; private fDrawn = 0;
  private gRaf: number | null = null;
  private sRaf: number | null = null; private sLast = 0;
  private ffRaf: number | null = null; private ffLast = 0;
  private ffTimer: ReturnType<typeof setTimeout> | null = null;
  // 스프링 상태
  private byX: FieldModel['plants'] | null = null;
  private xs: number[] | null = null;
  private live: FieldModel['plants'] | null = null;
  private pvx: number | null = null; private pvv = 0; private pxPrev: number | null = null;
  private pxS: number | null = null; private pInf: number | null = null;
  // 반딧불이 상태
  private ffn2: FFNode[] = [];
  private ffMode: 'idle' | 'pending' | 'attract' | 'release' = 'idle';
  private ffPid: number | null = null;
  private ffSx = 0; private ffSy = 0; private ffPx = 0; private ffPy = 0;
  private ffPausedDrift = false;
  // 배경 베이크
  private bgKey: string | null = null; private bgBake: HTMLCanvasElement | null = null;
  private fgKey: string | null = null; private fgBake: HTMLCanvasElement | null = null;
  // 리스너
  private io: IntersectionObserver | null = null;
  private bound = false;
  private onPm: ((ev: PointerEvent) => void) | null = null;
  private onPl: (() => void) | null = null;
  private onRs2: (() => void) | null = null;
  private onScr: (() => void) | null = null;
  private ffDownH: ((ev: PointerEvent) => void) | null = null;
  private ffMvH: ((ev: PointerEvent) => void) | null = null;
  private ffUpH: ((ev: PointerEvent) => void) | null = null;
  private ffBlurH: (() => void) | null = null;
  private clickH: (() => void) | null = null;
  private eIOc: ((x: number) => number) | null = null;
  private eBlc: ((x: number) => number) | null = null;

  constructor(opts: { reduce: boolean; onGrown: (g: boolean) => void }) {
    this.reduce = opts.reduce;
    this.onGrown = opts.onGrown;
  }

  /* ── 공개 API ─────────────────────────────── */
  attach(canvas: HTMLCanvasElement, defsHost: SVGSVGElement) {
    this.f = canvas;
    this.defsEl = defsHost;
    this.bind();
    if (this.model) this.initField();
  }
  setModel(model: FieldModel, opts?: { keepProgress?: boolean }) {
    const had = !!this.model;
    this.model = model;
    this.modelV++;
    this.atlasKey = null; this.atlas = null;
    this.byX = null; this.xs = null; this.live = null;
    this.shdJob = null; this.bgJob = null; this.fgJob = null;
    this.shdKey = null; this.bgKey = null; this.bgBake = null; this.fgKey = null; this.fgBake = null;
    applyModelTheme(model, this.dark);
    if (!this.f) return;
    this.initField();
    if (had && !opts?.keepProgress) this.resetGrow(); // 데이터/프리셋 변경 → 다시 성장 (시안 componentDidUpdate)
  }
  setDark(dark: boolean) {
    if (this.dark === dark) return;
    // 초원 캔버스는 CSS 트랜지션이 없다 — 직전 프레임을 위에 얹고 알파를 내려 색이 튀지 않게 한다 (시안 commitTheme)
    if (!this.reduce && this.f && this.f.width) {
      try {
        const c = document.createElement('canvas');
        c.width = this.f.width; c.height = this.f.height;
        c.getContext('2d')!.drawImage(this.f, 0, 0);
        this.xf = c; this.xfT0 = performance.now();
      } catch { this.xf = null; }
    }
    this.dark = dark;
    if (this.model) applyModelTheme(this.model, dark);
    this.shdKey = null; this.bgKey = null; this.fgKey = null; this.atlasKey = null; this.divCol = null; this.dirty = true;
    this.bgKey = null; this.bgBake = null; this.fgKey = null; this.fgBake = null;
    requestAnimationFrame(() => { this.ensureAtlas(); this.fieldLoop(); });
  }
  /** 섹션 리빌 완료 시 true — 보이는 중이면 즉시 성장 시작 */
  setActive(a: boolean) {
    this.active = a;
    if (a && this.vis && !this.grown && !this.growing) this.startGrow();
  }
  replay() { this.resetGrow(); }
  isGrown() { return this.grown; }
  destroy() {
    const f = this.f;
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
    if (this.sRaf) cancelAnimationFrame(this.sRaf);
    if (this.ffRaf) cancelAnimationFrame(this.ffRaf);
    if (this.fRaf) cancelAnimationFrame(this.fRaf);
    if (this.ffTimer) clearTimeout(this.ffTimer);
    if (this.io) this.io.disconnect();
    if (f) {
      if (this.onPm) f.removeEventListener('pointermove', this.onPm);
      if (this.onPl) f.removeEventListener('pointerleave', this.onPl);
      if (this.ffDownH) f.removeEventListener('pointerdown', this.ffDownH);
      if (this.ffMvH) f.removeEventListener('pointermove', this.ffMvH);
      if (this.ffUpH) { f.removeEventListener('pointerup', this.ffUpH); f.removeEventListener('pointercancel', this.ffUpH); f.removeEventListener('pointerleave', this.ffUpH); }
      if (this.clickH) f.removeEventListener('click', this.clickH);
    }
    if (this.onRs2) window.removeEventListener('resize', this.onRs2);
    if (this.onScr) window.removeEventListener('scroll', this.onScr);
    if (this.ffBlurH) window.removeEventListener('blur', this.ffBlurH);
    this.f = null; this.defsEl = null; this.model = null; this.bound = false;
  }

  /* ── 초기화/바인딩 ─────────────────────────── */
  private initField() {
    const f = this.f!;
    this.rect = f.getBoundingClientRect();
    this.ffRegister();
    this.ensureAtlas();
    this.setProgress(this.reduce || (this.grown && this.p != null) ? 1 : this.p || 0);
    if (this.reduce && !this.grown) { this.grown = true; this.onGrown(true); }
    this.fieldLoop();
  }
  private bind() {
    if (this.bound || !this.f) return;
    this.bound = true;
    const f = this.f;
    this.io = new IntersectionObserver((es) => {
      this.vis = es.some((x) => x.isIntersecting);
      if (this.vis) { this.rect = f.getBoundingClientRect(); this.fLast = 0; this.dirty = true; this.fieldLoop(); }
      if (this.vis && !this.grown && !this.growing && this.active) this.startGrow();
      if (!this.vis && this.sRaf) { cancelAnimationFrame(this.sRaf); this.sRaf = null; this.pvx = null; }
    });
    this.io.observe(f);
    this.onRs2 = () => { this.rect = f.getBoundingClientRect(); this.dirty = true; };
    this.onScr = () => { if (this.vis) this.rect = f.getBoundingClientRect(); };
    window.addEventListener('scroll', this.onScr, { passive: true });
    window.addEventListener('resize', this.onRs2);
    this.onPm = (ev) => {
      if (this.reduce || ev.pointerType === 'touch' || !this.vis) return;
      this.rect = f.getBoundingClientRect(); // 스크롤 반영
      this.pvx = ((ev.clientX - this.rect.left) / this.rect.width) * 1600;
      this.springLoop();
    };
    this.onPl = () => { this.pvx = null; this.pvv = 0; this.pxPrev = null; this.springLoop(); };
    f.addEventListener('pointermove', this.onPm);
    f.addEventListener('pointerleave', this.onPl);
    this.ffDownH = (ev) => this.ffDown(ev);
    this.ffMvH = (ev) => this.ffMove(ev);
    this.ffUpH = (ev) => { if (ev.pointerId === this.ffPid) this.ffRelease(); };
    this.ffBlurH = () => { if (this.ffPid != null || this.ffMode === 'attract') this.ffRelease(); };
    f.addEventListener('pointerdown', this.ffDownH);
    f.addEventListener('pointermove', this.ffMvH);
    f.addEventListener('pointerup', this.ffUpH);
    f.addEventListener('pointercancel', this.ffUpH);
    f.addEventListener('pointerleave', this.ffUpH);
    window.addEventListener('blur', this.ffBlurH);
    this.clickH = () => { if (this.ffLong) { this.ffLong = false; return; } if (!this.grown && !this.growing) this.startGrow(); };
    f.addEventListener('click', this.clickH);
  }
  private ffRegister() {
    this.ffn2 = [];
    if (!this.model) return;
    for (const o of this.model.ff) {
      this.ffn2.push({
        f: o, band: o.band, bx: o.bx, by: o.by,
        gp: o.gp, spin: o.spin, rmin: o.rmin, ph: o.ph,
        x: 0, y: 0, vx: 0, vy: 0, rt: 0, rsp: 1.4, turn: 0.05,
        boost: 0, face: this.reduce ? (o.i % 2 ? -1 : 1) : 1, hold: 0, lastFx: null,
      });
    }
  }

  /* ── 은은한 바람 ───────────────────────────── */
  /**
   * 오른쪽으로만 부는 돌풍 한 주기(P=6.2s): 0→OUT 구간에서 가속해 끝점에 닿고,
   * 남은 구간에서 천천히 제자리로 돌아온다. 반환값에 더 느린 사인을 곱해 세기를 흔든다.
   * lag(위상 지연)을 x좌표에 비례해 주면 바람이 왼쪽에서 오른쪽으로 밀려가 보인다.
   */
  private gust(t: number, lag: number) {
    const P = 6.2;
    const ph = (t - (lag || 0)) / P;
    const u = ph - Math.floor(ph);
    const OUT = 0.44;
    let v: number;
    if (u < OUT) { const k = u / OUT; v = 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(k, 1.3)); }
    else { const k = (u - OUT) / (1 - OUT); v = (1 + Math.cos(Math.PI * k)) / 2; }
    return v * (0.74 + 0.26 * Math.sin(t * 0.21 + (lag || 0)));
  }

  /* ── 성장 ─────────────────────────────────── */
  private startGrow() {
    if (!this.model) return;
    this.growing = true;
    this.bloomT0 = performance.now();
    this.fieldLoop();
    const t0 = performance.now(), dur = 3200;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      this.setProgress(Math.pow(t, 0.92));
      if (t < 1) this.gRaf = requestAnimationFrame(step);
      else { this.growing = false; this.grown = true; this.onGrown(true); }
    };
    this.gRaf = requestAnimationFrame(step);
  }
  private resetGrow() {
    if (this.gRaf) cancelAnimationFrame(this.gRaf);
    this.gRaf = null;
    this.growing = false; this.grown = false;
    this.bloomT0 = null;
    this.ffReset();
    if (this.reduce) {
      this.setProgress(1); this.grown = true; this.onGrown(true);
      return;
    }
    this.setProgress(0);
    this.onGrown(false);
    this.startGrow();
  }
  private setProgress(p: number) {
    const plants = this.model?.plants;
    if (!plants) return;
    const rew = p < (this.p == null ? -1 : this.p);
    this.p = p;
    const eo = (x: number) => 1 - Math.pow(1 - x, 3);
    const win = (w: [number, number]) => { const d = w[1] - w[0]; if (!(d > 0)) return p >= w[1] ? 1 : 0; return Math.min(1, Math.max(0, (p - w[0]) / d)); };
    const bk = (x: number) => { if (x <= 0) return 0.001; const u = x - 1; return 1 + 2.6 * u * u * u + 1.6 * u * u; };
    if (rew) for (const o of plants) o.done = false;
    this.ffOp = eo(Math.min(1, Math.max(0, (p - 0.22) / 0.78)));
    for (const o of plants) {
      if (o.s > p) break;
      if (o.done) continue;
      const l1 = win(o.w1), l2 = win(o.w2), lh = win(o.wh);
      o.sy1 = Math.max(0.001, eo(l1));
      o.sy2 = Math.max(0.001, eo(l2));
      o.sy3 = Math.max(0.001, eo(win(o.w3)));
      o.sla = Math.max(0.001, bk(win(o.wa)));
      o.slb = Math.max(0.001, bk(win(o.wb)));
      o.syh = lh < 1 ? Math.max(0.02, 1 - Math.pow(2, -9 * lh) * Math.cos(lh * 13.5)) : 1;
      o.sch = Math.max(0.02, bk(lh));
      const er = Math.min(1, (p - o.s) / Math.max(0.02, (o.e - o.s) * 0.22));
      o.elOp = er > 0 ? er : 0;
      o.o2 = l1 > 0.85 ? 1 : 0;
      o.o3 = l2 > 0.85 ? 1 : 0;
      o.oh = lh > 0 ? Math.min(1, lh * 3) : 0;
      o.done = p >= o.wh[1] && p >= o.w3[1] && p >= o.wb[1];
    }
    this.dirty = true;
    this.fieldLoop();
  }

  /* ── 반딧불이 인터랙션 (길게 눌러 모으기) ───── */
  private ffPointer(ev: PointerEvent) {
    const f = this.f;
    if (!f) return null;
    // 스크롤로 캔버스가 움직였을 수 있으므로 매 이벤트마다 새로 읽는다 (캐시하면 반딧불이가 엉뚱한 높이로 모인다)
    const r = (this.rect = f.getBoundingClientRect());
    if (!r.width || !r.height) return null;
    return { x: ((ev.clientX - r.left) / r.width) * 1600, y: ((ev.clientY - r.top) / r.height) * 340 };
  }
  private ffDown(ev: PointerEvent) {
    if (ev.button > 0 || this.ffPid != null) return;
    if (!(this.ffOp > 0.2)) return;
    if (!this.ffn2.length) this.ffRegister();
    if (!this.ffn2.length) return;
    const p = this.ffPointer(ev);
    if (!p) return;
    this.ffPid = ev.pointerId;
    this.ffMode = 'pending';
    this.ffSx = p.x; this.ffSy = p.y;
    this.ffPx = p.x; this.ffPy = p.y;
    this.ffLong = false;
    if (this.ffTimer) clearTimeout(this.ffTimer);
    this.ffTimer = setTimeout(() => { this.ffTimer = null; this.ffAttract(); }, 300);
  }
  private ffMove(ev: PointerEvent) {
    if (ev.pointerId !== this.ffPid) return;
    const p = this.ffPointer(ev);
    if (!p) return;
    this.ffPx = p.x; this.ffPy = p.y;
    if (this.ffMode === 'pending' && Math.hypot(p.x - this.ffSx, p.y - this.ffSy) > 10) {
      if (this.ffTimer) clearTimeout(this.ffTimer);
      this.ffTimer = null; this.ffMode = 'idle'; this.ffPid = null;
    }
  }
  private ffAttract() {
    if (this.ffPid == null) return;
    if (!this.ffn2.length) this.ffRegister();
    if (!this.ffn2.length) return;
    this.ffMode = 'attract';
    this.ffLong = true;
    this.ffPausedDrift = true;
    for (const o of this.ffn2) {
      o.boost = 1;
      o.vx += (Math.random() - 0.5) * 0.8;
      o.vy += (Math.random() - 0.5) * 0.8;
    }
    this.ffLoop();
  }
  private ffRelease() {
    if (this.ffTimer) clearTimeout(this.ffTimer);
    this.ffTimer = null;
    this.ffPid = null;
    if (this.ffMode !== 'attract') { this.ffMode = 'idle'; return; }
    this.ffMode = 'release';
    this.ffPausedDrift = false;
    const now = performance.now();
    for (const o of this.ffn2) {
      const a = Math.random() * Math.PI * 2, m = 0.5 + Math.random() * 1.8;
      o.vx = o.vx * 0.3 + Math.cos(a) * m;
      o.vy = o.vy * 0.3 + Math.sin(a) * m * 0.7;
      o.rt = now + 100 + Math.random() * 540;
      o.rsp = 0.95 + Math.random() * 1.7;
      o.turn = 0.032 + Math.random() * 0.05;
    }
    this.ffLoop();
  }
  private ffReset() {
    if (this.ffTimer) clearTimeout(this.ffTimer);
    this.ffTimer = null;
    if (this.ffRaf) cancelAnimationFrame(this.ffRaf);
    this.ffRaf = null;
    this.ffPid = null; this.ffMode = 'idle'; this.ffLong = false; this.ffOp = 0;
    this.ffPausedDrift = false;
    for (const o of this.ffn2) { o.x = 0; o.y = 0; o.vx = 0; o.vy = 0; o.rt = 0; o.boost = 0; }
    this.dirty = true;
  }
  private ffLoop() {
    if (this.ffRaf || this.reduce) return;
    this.ffLast = 0;
    const step = (now: number) => {
      this.ffRaf = null;
      const mode = this.ffMode;
      const dt = Math.min(2.5, Math.max(0.35, (now - (this.ffLast || now - 16.667)) / 16.667));
      this.ffLast = now;
      const dmp = (k: number) => Math.pow(k, dt);
      let active = false;
      for (const o of this.ffn2) {
        if (mode === 'attract') {
          const tx = this.ffPx - o.bx, ty = this.ffPy - o.by;
          let dx = tx - o.x, dy = ty - o.y;
          const d = Math.hypot(dx, dy) || 0.001;
          dx /= d; dy /= d;
          const pull = Math.min(0.5, 110 / (d + 190)) * o.gp * dt;
          o.vx += dx * pull; o.vy += dy * pull;
          const sw = o.spin * pull * 1.6;
          o.vx += -dy * sw; o.vy += dx * sw;
          if (d < o.rmin) { const push = (1 - d / o.rmin) * 0.22 * dt; o.vx -= dx * push; o.vy -= dy * push; }
          o.vx *= dmp(0.95); o.vy *= dmp(0.95);
          active = true;
        } else if (now < (o.rt || 0)) {
          o.vx *= dmp(0.972); o.vy *= dmp(0.972);
          active = true;
        } else {
          const d = Math.hypot(o.x, o.y);
          if (d > 0.9 || Math.hypot(o.vx, o.vy) > 0.05) {
            const sp = Math.min(o.rsp || 1.4, 0.12 + d * 0.06);
            const nx = -o.x / (d || 1), ny = -o.y / (d || 1);
            const tr = Math.min(0.6, (o.turn || 0.05) * dt);
            o.vx += (nx * sp - o.vx) * tr + (Math.random() - 0.5) * 0.016 * dt;
            o.vy += (ny * sp * 0.85 - o.vy) * tr + (Math.random() - 0.5) * 0.014 * dt;
            o.vx *= dmp(0.988); o.vy *= dmp(0.988);
            active = true;
          } else { o.x = 0; o.y = 0; o.vx = 0; o.vy = 0; }
        }
        o.x += o.vx * dt; o.y += o.vy * dt;
      }
      this.dirty = true;
      if (active) this.ffRaf = requestAnimationFrame(step);
      else {
        this.ffMode = 'idle';
        for (const o of this.ffn2) o.boost = 0;
      }
    };
    this.ffRaf = requestAnimationFrame(step);
  }

  /* ── 포인터 스프링 (바람에 흔들리는 풀) ─────── */
  private springLoop() {
    if (this.sRaf || !this.vis || this.reduce || !this.model) return;
    const plants = this.model.plants;
    if (!this.byX) {
      this.byX = plants.slice().sort((a, b) => a.x - b.x);
      this.xs = this.byX.map((p) => p.x);
      this.live = [];
    }
    const xs = this.xs!, byX = this.byX, live = this.live!;
    const lo = (v: number) => { let a = 0, b = xs.length; while (a < b) { const m = (a + b) >> 1; if (xs[m] < v) a = m + 1; else b = m; } return a; };
    const step = (now: number) => {
      this.sRaf = null;
      const R = 165, rawPx = this.pvx;
      const dt = Math.min(2.5, Math.max(0.35, (now - (this.sLast || now - 16.667)) / 16.667));
      this.sLast = now;
      if (this.pInf == null) this.pInf = 0;
      if (rawPx != null && this.pxS == null) this.pxS = rawPx;
      const tgI = rawPx == null ? 0 : 1;
      this.pInf += (tgI - this.pInf) * Math.min(1, (tgI > this.pInf ? 0.085 : 0.05) * dt);
      if (rawPx != null && this.pxS != null) this.pxS += (rawPx - this.pxS) * Math.min(1, 0.24 * dt);
      const inf = this.pInf;
      if (rawPx == null && inf <= 0.004) { this.pxS = null; this.pInf = 0; this.pxPrev = null; }
      const px = this.pxS != null && inf > 0.004 ? this.pxS : null;
      const raw = px != null && this.pxPrev != null ? (px - this.pxPrev) / dt : 0;
      this.pxPrev = px;
      this.pvv = (this.pvv || 0) * 0.5 + raw * 0.5;
      const vc0 = Math.max(-30, Math.min(30, this.pvv));
      const vc = (vc0 * Math.abs(vc0)) / 30;
      if (px != null) {
        const i1 = lo(px + R);
        for (let i = lo(px - R); i < i1; i++) { const p = byX[i]; if (!p.live) { p.live = true; live.push(p); } }
      }
      let n = 0;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        let t = 0, inR = false, w = 0;
        if (px != null) {
          const dx = p.x - px, ad = Math.abs(dx);
          if (ad < R) { w = (1 - ad / R) * inf; t = (dx > 0 ? 1 : -1) * w * w; inR = true; }
        }
        if (inR && !p.hot) { const kk = t * p.amp * dt; p.v3 += kk * 0.14; p.v2 += kk * 0.09; p.v1 += kk * 0.04; }
        p.hot = inR;
        const am = p.amp;
        if (inR && vc) {
          const im = vc * w * w * 0.072 * am * dt;
          p.v3 += im; p.v2 += im * 0.6; p.v1 += im * 0.27;
          const cap = 5 * am;
          if (p.v3 > cap) p.v3 = cap; else if (p.v3 < -cap) p.v3 = -cap;
        }
        p.tt += (t - p.tt) * Math.min(0.4, (Math.abs(t) > Math.abs(p.tt) ? 0.12 : 0.05) * dt);
        const tg = p.tt;
        const dc = Math.pow(1 - p.d, dt);
        p.v1 = p.v1 * dc + (tg * 1.8 * am - p.b1) * p.k * dt; p.b1 += p.v1 * dt;
        p.vm = p.vm * dc + (tg * 2.1 * am - p.bm) * p.k * 0.97 * dt; p.bm += p.vm * dt;
        p.v2 = p.v2 * dc + (tg * 2.4 * am - p.b2) * p.k * 0.94 * dt; p.b2 += p.v2 * dt;
        p.v3 = p.v3 * dc + (tg * 2.7 * am - p.b3) * p.k * 0.9 * dt; p.b3 += p.v3 * dt;
        p.v4 = p.v4 * dc + (tg * 3.0 * am - p.b4) * p.k * 0.86 * dt; p.b4 += p.v4 * dt;
        const bMax = 4.2 * am;
        if (p.b1 > bMax) p.b1 = bMax; else if (p.b1 < -bMax) p.b1 = -bMax;
        if (p.bm > bMax) p.bm = bMax; else if (p.bm < -bMax) p.bm = -bMax;
        if (p.b2 > bMax) p.b2 = bMax; else if (p.b2 < -bMax) p.b2 = -bMax;
        if (p.b3 > bMax) p.b3 = bMax; else if (p.b3 < -bMax) p.b3 = -bMax;
        if (p.b4 > bMax) p.b4 = bMax; else if (p.b4 < -bMax) p.b4 = -bMax;
        if (inR || Math.abs(p.v3) > 0.0016 || Math.abs(p.v4) > 0.0016 || Math.abs(p.b4 - tg * 3.0 * am) > 0.01 || Math.abs(p.tt) > 0.003) live[n++] = p;
        else { p.v1 = p.v2 = p.v3 = p.v4 = p.vm = 0; p.b1 = p.b2 = p.b3 = p.b4 = p.bm = 0; p.tt = 0; p.live = false; }
      }
      live.length = n;
      this.dirty = true;
      if (n) this.sRaf = requestAnimationFrame(step);
    };
    this.sLast = 0;
    this.sRaf = requestAnimationFrame(step);
  }

  /* ── 이징/키프레임 유틸 ─────────────────────── */
  private ezLUT(x1: number, y1: number, x2: number, y2: number) {
    const N = 48, xs: number[] = [], ys: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u2 = i / N, v = 1 - u2;
      xs.push(3 * v * v * u2 * x1 + 3 * v * u2 * u2 * x2 + u2 * u2 * u2);
      ys.push(3 * v * v * u2 * y1 + 3 * v * u2 * u2 * y2 + u2 * u2 * u2);
    }
    return (x: number) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let i = 1;
      while (i < N && xs[i] < x) i++;
      const k = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * k;
    };
  }
  private get eIO() { return this.eIOc || (this.eIOc = this.ezLUT(0.42, 0, 0.58, 1)); }
  private get eBl() { return this.eBlc || (this.eBlc = this.ezLUT(0.2, 0.86, 0.28, 1)); }
  private pmod(x: number) { return x - Math.floor(x); }
  private flyX(F: Firefly['nx'], t: number) {
    const c = this.pmod((t - F.flyDel) / F.flyDur / 2) * 2;
    return -F.fdx + 2 * F.fdx * this.eIO(c < 1 ? c : 2 - c);
  }
  private bobY(F: Firefly['nx'], t: number) {
    const ph = this.pmod((t - F.bobDel) / F.bobDur);
    return ph < 0.5 ? F.fdy - 2 * F.fdy * this.eIO(ph * 2) : -F.fdy + 2 * F.fdy * this.eIO((ph - 0.5) * 2);
  }
  private flick(F: Firefly['nx'], t: number) {
    const ph = this.pmod((t - F.flickDel) / F.flickDur);
    return 0.82 + 0.18 * (ph < 0.5 ? this.eIO(ph * 2) : 1 - this.eIO((ph - 0.5) * 2));
  }
  private kfBloom(k: number) {
    const E = this.eBl;
    const o = k < 0.46 ? E(k / 0.46) : 1;
    let ty: number, sx: number, sy: number;
    if (k < 0.74) { const e = E(k / 0.74); ty = 9 * (1 - e); sx = 0.88 + 0.15 * e; sy = 0.05 + 1.0 * e; }
    else { const e = E((k - 0.74) / 0.26); ty = 0; sx = 1.03 - 0.03 * e; sy = 1.05 - 0.05 * e; }
    return { o, ty, sx, sy };
  }

  /* ── 아틀라스 (SVG → 캔버스 래스터) ─────────── */
  private atlasIds() {
    const set: Record<string, 1> = {};
    for (const c of this.model?.cand ?? []) {
      if (c.bg) set[c.href] = 1;
      else {
        set[c.s1] = 1; set[c.s2] = 1; set[c.s3] = 1;
        set[c.la] = 1; set[c.lb] = 1;
        if (c.hasHead) set[c.hr] = 1;
      }
    }
    for (let i = 0; i < 5; i++) set['bfF' + i] = 1;
    return Object.keys(set);
  }
  private deepenAtlas(cvs: HTMLCanvasElement, meta: Atlas['meta'], S: number, baseId: (s: string) => string, ids: string[]) {
    const cx = cvs.getContext('2d');
    if (!cx) return;
    let tc: HTMLCanvasElement | null = null, tx: CanvasRenderingContext2D | null = null;
    for (const id of ids) {
      if (baseId(id) === id) continue;
      const m = meta[id];
      const px = Math.round(m.ax * S), py = Math.round(m.ay * S);
      const pw = Math.round(m.w * S), ph = Math.round(m.h * S);
      if (pw < 1 || ph < 1) continue;
      if (!tc) { tc = document.createElement('canvas'); tx = tc.getContext('2d'); }
      if (!tx) return;
      tc.width = pw; tc.height = ph;
      tx.clearRect(0, 0, pw, ph);
      tx.drawImage(cvs, px, py, pw, ph, 0, 0, pw, ph);
      cx.save();
      cx.clearRect(px, py, pw, ph);
      try { cx.filter = 'saturate(1.8) brightness(0.84)'; } catch { /* noop */ }
      cx.drawImage(tc, px, py);
      cx.restore();
    }
  }
  /**
   * 방향광 모델링 — 셀마다 좌(빛)→우(음영) 명암을 넣는다. multiply/screen으로 색만 바꾸고
   * destination-in으로 원본 알파를 복원해 실루엣이 투명해지지 않게 한다. 프레임당 비용 0(아틀라스에 구워둠).
   */
  private shadeAtlas(cvs: HTMLCanvasElement, meta: Atlas['meta'], S: number, ids: string[]) {
    const cx = cvs.getContext('2d');
    if (!cx) return;
    let tc: HTMLCanvasElement | null = null, tx: CanvasRenderingContext2D | null = null;
    for (const id of ids) {
      const m = meta[id];
      const px = Math.round(m.ax * S), py = Math.round(m.ay * S);
      const pw = Math.round(m.w * S), ph = Math.round(m.h * S);
      if (pw < 2 || ph < 2) continue;
      if (!tc) { tc = document.createElement('canvas'); tx = tc.getContext('2d'); }
      if (!tx) return;
      tc.width = pw; tc.height = ph;
      tx.globalCompositeOperation = 'source-over';
      tx.clearRect(0, 0, pw, ph);
      tx.drawImage(cvs, px, py, pw, ph, 0, 0, pw, ph);
      const g1 = tx.createLinearGradient(0, 0, pw, ph * 0.45);
      g1.addColorStop(0, '#ffffff');
      g1.addColorStop(0.42, '#fbf6ea');
      g1.addColorStop(0.72, '#c9bfa6');
      g1.addColorStop(1, '#93876b');
      tx.globalCompositeOperation = 'multiply';
      tx.fillStyle = g1;
      tx.fillRect(0, 0, pw, ph);
      const g2 = tx.createLinearGradient(0, 0, pw * 0.86, ph * 0.5);
      g2.addColorStop(0, '#3a3018');
      g2.addColorStop(0.34, '#171204');
      g2.addColorStop(1, '#000000');
      tx.globalCompositeOperation = 'screen';
      tx.fillStyle = g2;
      tx.fillRect(0, 0, pw, ph);
      tx.globalCompositeOperation = 'destination-in';
      tx.drawImage(cvs, px, py, pw, ph, 0, 0, pw, ph);
      cx.save();
      cx.clearRect(px, py, pw, ph);
      cx.globalCompositeOperation = 'source-over';
      cx.drawImage(tc, px, py);
      cx.restore();
    }
  }

  /**
   * 인글로우(림 라이트) — 맨앞(tier 0 · 'G'/'GD') 오브젝트에 좌상단 얇은 노란 테두리 빛.
   * 실루엣에서 우하단으로 민 복사본을 지워 좌상단 띠만 남기고, 그 띠를 따뜻한 노란빛으로 lighter 합성한다.
   * 세기: 맨앞 초록 0.68 · 주황·금색 잎(l 계열, 중경) 0.42 · 꽃송이 0.52 · 그 외 0.
   */
  private rimAtlas(cvs: HTMLCanvasElement, meta: Atlas['meta'], S: number, ids: string[]) {
    const cx = cvs.getContext('2d');
    if (!cx) return;
    const base0 = (id: string) => (id.length > 1 && id.charAt(id.length - 1) === 'D' ? id.slice(0, -1) : id);
    const isHead = (id: string) => /^[dcp][123]h$/.test(base0(id));
    const rimAmt = (id: string) => {
      const s0 = base0(id);
      if (s0.charAt(s0.length - 1) === 'G') return 0.68;
      if (s0.charAt(0) === 'l') return 0.42;
      if (isHead(id)) return 0.52;
      return 0;
    };
    let tc: HTMLCanvasElement | null = null, tx: CanvasRenderingContext2D | null = null;
    for (const id of ids) {
      const amt = rimAmt(id);
      if (!amt) continue;
      const m = meta[id];
      const px = Math.round(m.ax * S), py = Math.round(m.ay * S);
      const pw = Math.round(m.w * S), ph = Math.round(m.h * S);
      if (pw < 3 || ph < 3) continue;
      if (!tc) { tc = document.createElement('canvas'); tx = tc.getContext('2d'); }
      if (!tx) return;
      tc.width = pw; tc.height = ph;
      const d = Math.max(1, Math.round(1.1 * S));
      tx.globalCompositeOperation = 'source-over';
      tx.clearRect(0, 0, pw, ph);
      tx.drawImage(cvs, px, py, pw, ph, 0, 0, pw, ph);
      tx.globalCompositeOperation = 'destination-out';
      tx.drawImage(cvs, px, py, pw, ph, d, d * 0.9, pw, ph);
      const head = isHead(id);
      tx.globalCompositeOperation = 'source-in';
      tx.fillStyle = head ? 'rgba(255,244,190,1)' : 'rgba(255,234,132,1)';
      tx.fillRect(0, 0, pw, ph);
      // 위(빛 받는 끝)는 선명하게, 아래(밑동)로 갈수록 약해지게 알파를 깎는다
      tx.globalCompositeOperation = 'destination-in';
      const gv = tx.createLinearGradient(0, 0, 0, ph);
      gv.addColorStop(0, 'rgba(255,255,255,1)');
      // 꽃송이는 둥근 덩어리라 아래쪽도 빛을 조금 받는다 — 잎/줄기보다 완만하게 감쇠
      gv.addColorStop(head ? 0.55 : 0.42, head ? 'rgba(255,255,255,0.76)' : 'rgba(255,255,255,0.62)');
      gv.addColorStop(head ? 0.85 : 0.78, head ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.2)');
      gv.addColorStop(1, head ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0)');
      tx.fillStyle = gv;
      tx.fillRect(0, 0, pw, ph);
      cx.save();
      cx.beginPath(); cx.rect(px, py, pw, ph); cx.clip();
      cx.globalCompositeOperation = 'lighter';
      cx.globalAlpha = amt;
      try { cx.filter = 'blur(' + (0.45 * S).toFixed(2) + 'px)'; } catch { /* noop */ }
      cx.drawImage(tc, px, py);
      cx.restore();
    }
  }

  private ensureAtlas() {
    const key = (this.dark ? 'dark' : 'light') + '|' + this.modelV;
    if (this.atlasKey === key && (this.atlas || this.atlasBusy)) return;
    // 캐시 히트: 재래스터 없이 즉시 교체 — 테마 토글 시 한 프레임도 멈추지 않는다
    const cached = ATLAS_CACHE.get(key);
    if (cached) {
      this.atlasKey = key;
      this.atlasBusy = false;
      this.atlas = cached;
      this.bgKey = null; this.fgKey = null; this.shdKey = null; // 캔버스는 유지 — 순차 리베이크
      this.dirty = true;
      this.fieldLoop();
      return;
    }
    const pending = ATLAS_INFLIGHT.get(key);
    if (pending) {
      this.atlasKey = key;
      this.atlasBusy = true;
      void pending
        .then((built) => {
          if (this.atlasKey !== key) return;
          this.atlasBusy = false;
          this.atlas = built;
          this.bgKey = null; this.fgKey = null; this.shdKey = null;
          this.dirty = true;
          this.fieldLoop();
        })
        .catch(() => {
          this.atlasBusy = false;
        });
      return;
    }
    const dEl = this.defsEl;
    if (!dEl || !this.model) return;
    this.atlasKey = key;
    this.atlasBusy = true;
    let settleBuild: (a: Atlas) => void = () => {};
    let failBuild: () => void = () => {};
    ATLAS_INFLIGHT.set(
      key,
      new Promise<Atlas>((res, rej) => {
        settleBuild = (a) => { ATLAS_INFLIGHT.delete(key); res(a); };
        failBuild = () => { ATLAS_INFLIGHT.delete(key); rej(new Error('atlas build failed')); };
      }),
    );
    const ids = this.atlasIds();
    const baseId = (s: string) => (s.length > 2 && s.charAt(s.length - 1) === 'D' && s.charAt(s.length - 2) === 'G' ? s.slice(0, -1) : s);
    const meta: Atlas['meta'] = {};
    const PAD = 6;
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    dEl.appendChild(tmp);
    for (const id of ids) {
      const bid = baseId(id);
      let b = BBOX_CACHE.get(bid) ?? null;
      if (!b) {
        tmp.setAttribute('href', '#' + bid);
        try {
          const r = tmp.getBBox();
          b = { x: r.x, y: r.y, width: r.width, height: r.height };
        } catch { /* jsdom 등 */ }
        if (!b || (!b.width && !b.height)) b = { x: -20, y: -60, width: 40, height: 70 };
        BBOX_CACHE.set(bid, b);
      }
      meta[id] = { x: b.x - PAD, y: b.y - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2, ax: 0, ay: 0 };
    }
    dEl.removeChild(tmp);
    const ROWW = 1280;
    let cx = 0, cy = 0, rowH = 0;
    for (const id of ids) {
      const m = meta[id];
      if (cx + m.w > ROWW && cx > 0) { cx = 0; cy += rowH; rowH = 0; }
      m.ax = cx; m.ay = cy; cx += m.w;
      if (m.h > rowH) rowH = m.h;
    }
    const W = ROWW, H = Math.max(1, cy + rowH);

    // defs 마크업은 정적이라 한 번만 직렬화한다(outerHTML은 트리 전체를 문자열로 만든다).
    if (RAW_DEFS === null) {
      const defsNode = dEl.querySelector('defs');
      RAW_DEFS = defsNode ? defsNode.outerHTML : '';
    }
    const rawDefs = RAW_DEFS;
    const hasDeep = ids.some((id) => baseId(id) !== id);
    const themeName = document.documentElement.dataset.theme ?? 'light';
    const deepSwap = hasDeep && themeName !== 'dark';
    const defsKey = themeName + '|' + (deepSwap ? 'deep' : 'plain');

    let built = DEFS_CACHE.get(defsKey);
    if (!built) {
      const cs = getComputedStyle(document.documentElement);
      // var() 값은 이름당 한 번만 읽는다 — 예전엔 등장할 때마다 getPropertyValue를 불렀다.
      const varCache = new Map<string, string>();
      const cssVar = (v: string) => {
        let hit = varCache.get(v);
        if (hit === undefined) {
          hit = cs.getPropertyValue(v).trim() || '#8a8a7a';
          varCache.set(v, hit);
        }
        return hit;
      };
      const sub = (str: string, ov: Record<string, string>) =>
        str.replace(/var\((--[A-Za-z0-9-]+)\)/g, (_mm, v: string) => ov[v] || cssVar(v));
      // 초록 오브젝트 2색상군: 기본(세이지 그린) 팔레트 + 'GD' 심볼용 올리브 모스 팔레트.
      // 라이트모드에서만 팔레트를 갈아 끼우고, 다크모드는 기존 필터 방식(deepenAtlas)을 유지한다.
      const DEEPG: Record<string, string> = { '--gn0a': '#5c7725', '--gn0b': '#6f8b2c', '--gn1a': '#839f33', '--gn1b': '#96ae3f', '--gn2a': '#aabd4b', '--gn2b': '#bcc95c', '--gn3a': '#c9d66e', '--gn3b': '#d8e18d', '--gstmLo': '#6c773a', '--gstmMid': '#9aa45a', '--gstmHi': '#d2d59a', '--gbr0': '#c9d66e', '--gbr1': '#aabd4b', '--gbr2': '#5c7725' };
      built = {
        plain: sub(rawDefs, {}),
        deep: deepSwap
          ? sub(rawDefs, DEEPG).replace(/id="([^"]+)"/g, 'id="$1_D"').replace(/href="#([^"]+)"/g, 'href="#$1_D"').replace(/url\(#([^)]+)\)/g, 'url(#$1_D)')
          : '',
      };
      DEFS_CACHE.set(defsKey, built);
    }
    const defsStr = built.plain;
    const defsDeep = built.deep;

    let uses = '';
    const MATID = /^(t[1-4]|f[1-7])/;
    let masks = '<linearGradient id="matFade" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.08" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0.34"/></linearGradient><filter id="deepG" color-interpolation-filters="sRGB" x="-18%" y="-18%" width="136%" height="136%"><feColorMatrix type="saturate" values="1.72"/><feComponentTransfer><feFuncR type="linear" slope="0.78"/><feFuncG type="linear" slope="0.87"/><feFuncB type="linear" slope="0.7"/></feComponentTransfer></filter>';
    for (const id of ids) {
      const m = meta[id];
      const bid = baseId(id);
      const ref = deepSwap && bid !== id ? bid + '_D' : bid;
      const u0 = '<use href="#' + ref + '" xlink:href="#' + ref + '" transform="translate(' + (m.ax - m.x).toFixed(2) + ' ' + (m.ay - m.y).toFixed(2) + ')"/>';
      if (MATID.test(id)) {
        const bx = m.ax.toFixed(2), by = m.ay.toFixed(2), bw2 = m.w.toFixed(2), bh2 = m.h.toFixed(2);
        masks += '<mask id="mf' + id + '" maskUnits="userSpaceOnUse" x="' + bx + '" y="' + by + '" width="' + bw2 + '" height="' + bh2 + '"><rect x="' + bx + '" y="' + by + '" width="' + bw2 + '" height="' + bh2 + '" fill="url(#matFade)"/></mask>';
        uses += '<g mask="url(#mf' + id + ')">' + u0 + '</g>';
      } else uses += u0;
    }
    const rw = (this.rect && this.rect.width) || 1056;
    // 아틀라스 해상도는 **필드 캔버스와 같은 DPR 상한**을 쓴다. raw devicePixelRatio를
    // 그대로 곱하면 S가 2에 가까워지는데, 캔버스는 1.5로 그리므로 그만큼 과표본이다.
    // 래스터는 픽셀 수에 비례하고 SVG 디코딩은 쪼갤 수 없는 작업이라 여기가 그대로 비용이 된다.
    const S = Math.min(2.4, Math.max(1.3, Math.min(1.5, window.devicePixelRatio || 1) * (rw / 1600) * 1.5));
    const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + W + ' ' + H + '" width="' + Math.ceil(W * S) + '" height="' + Math.ceil(H * S) + '">' + defsStr + defsDeep + '<defs>' + masks + '</defs>' + uses + '</svg>';
    const rasterize = (src: CanvasImageSource) => {
      let cvs: HTMLCanvasElement;
      try {
        cvs = document.createElement('canvas');
        cvs.width = Math.ceil(W * S);
        cvs.height = Math.ceil(H * S);
        cvs.getContext('2d')!.drawImage(src, 0, 0, cvs.width, cvs.height);
      } catch {
        this.atlasBusy = false;
        failBuild();
        return;
      }

      /*
       * 후처리(deepen/shade/rim)를 **프레임에 나눠** 돌린다.
       *
       * 세 패스 모두 스프라이트를 하나씩 돌면서 임시 캔버스를 새로 잡고(매번 백킹 스토어
       * 재할당) 그라디언트를 두세 번 합성한 뒤 아틀라스에 다시 써넣는다. 스프라이트당
       * 6~8회 캔버스 연산이라, 한 번에 돌리면 **끊을 수 없는 긴 작업** 하나가 되어 그동안
       * 화면 전체가 멈춘다. 하필 실행 시점이 업적 배지 등장 구간과 겹쳤다 — MeadowSection은
       * revealSec과 무관하게 데이터가 오는 즉시 마운트되기 때문이다. 진입 직후 배지 연출만
       * 툭 끊기던 원인이 이것이었다(연동을 끊으면 이 굽기 자체가 없어 멀쩡했다).
       *
       * bakeStep과 같은 시간 예산(SLICE_MS)으로 잘라 여러 프레임에 나눈다. 아틀라스는
       * 다 끝난 뒤에 공개한다 — 중간 상태를 그리면 색이 변해 가는 게 보인다.
       * 성장 시작(1350ms)까지는 여유가 충분하다.
       */
      const postIds = Object.keys(meta);
      const phases: Array<(chunk: string[]) => void> = [];
      if (!deepSwap) phases.push((c) => this.deepenAtlas(cvs, meta, S, baseId, c));
      phases.push((c) => this.shadeAtlas(cvs, meta, S, c));
      phases.push((c) => this.rimAtlas(cvs, meta, S, c));

      let ph = 0;
      let i = 0;
      const run = () => {
        // 그 사이 테마가 바뀌거나 엔진이 정리됐으면 이 작업은 버린다.
        if (this.atlasKey !== key) {
          this.atlasBusy = false;
          failBuild();
          return;
        }
        const t0 = performance.now();
        while (ph < phases.length) {
          if (i >= postIds.length) {
            ph += 1;
            i = 0;
            continue;
          }
          // **한 개씩** 처리하고 매번 예산을 확인한다. 예전엔 8개를 묶어 처리한 뒤에야
          // 확인했는데, 스프라이트 하나가 10~15ms라 한 덩어리가 이미 100ms를 넘었다
          // (긴 작업 하나가 넷으로 쪼개졌을 뿐 여전히 화면이 멈췄다).
          try {
            phases[ph]([postIds[i]]);
          } catch {
            /* 한 스프라이트가 실패해도 나머지는 계속 굽는다 */
          }
          i += 1;
          if (performance.now() - t0 > MeadowEngine.SLICE_MS) break;
        }
        if (ph < phases.length) {
          requestAnimationFrame(run);
          return;
        }
        const built: Atlas = { cvs, meta, S };
        this.atlas = built;
        if (ATLAS_CACHE.size >= ATLAS_CACHE_MAX) {
          ATLAS_CACHE.delete(ATLAS_CACHE.keys().next().value as string);
        }
        ATLAS_CACHE.set(key, built);
        settleBuild(built);
        this.bgKey = null;
        this.bgBake = null;
        this.fgKey = null;
        this.fgBake = null;
        this.shdKey = null;
        this.atlasBusy = false;
        this.dirty = true;
        this.fieldLoop();
      };
      run();
    };

    /*
     * SVG 디코딩을 **메인 스레드 밖으로** 뺀다.
     *
     * <img>에 blob URL을 물리면 브라우저가 그 SVG를 파싱·래스터하는데 그 일이 메인
     * 스레드에서 벌어지고, onload가 불릴 땐 이미 끝나 있다. 그래서 우리 계측엔 안 잡히고
     * (drawImage만 13ms로 보였다) 롱태스크로만 50~80ms가 찍혔다 — 210KB짜리 defs에
     * <use> 262개인 문서라 파싱만으로도 무겁다.
     *
     * createImageBitmap은 디코딩을 브라우저 내부 스레드에서 처리하고 결과만 넘겨준다.
     * SVG blob을 못 받는 환경도 있어(구형 사파리 등) 실패하면 기존 <img> 경로로 떨어진다.
     */
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const viaImage = () => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        rasterize(img);
      };
      img.onerror = () => { URL.revokeObjectURL(url); this.atlasBusy = false; failBuild(); };
      img.src = url;
    };
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(blob)
        .then((bmp) => {
          rasterize(bmp);
          bmp.close();
        })
        .catch(viaImage);
    } else {
      viaImage();
    }
  }

  /* ── 드로잉 ──────────────────────────────── */
  /**
   * 자연광 캐스트 섀도 — 밑동에 짧고 부드러운 그림자를 한 번 베이크해 매 프레임 재사용.
   * 빛이 좌상단에서 오므로 그림자는 우하단으로 짧게. 후경(dep 0·1)은 생략해 바닥이 띠처럼 뭉치지 않게 한다.
   */
  /**
   * 자연광 캐스트 섀도 — 밑동에 짧고 부드러운 그림자. 프레임당 ~5ms씩 나눠 구워 넣는다(앞→뒤 순차 채움).
   * 빛이 좌상단에서 오므로 그림자는 우하단으로 짧게. 후경(dep 0·1)은 생략해 바닥이 띠처럼 뭉치지 않게 한다.
   */
  private shadowStep(bw: number, bh: number, u: number, dark: boolean, shk: string) {
    if (!this.shdJob || this.shdJob.key !== shk) {
      let c: HTMLCanvasElement;
      try { c = document.createElement('canvas'); c.width = bw; c.height = bh; } catch { return; }
      const cx = c.getContext('2d');
      if (!cx) return;
      cx.setTransform(u, 0, 0, u, 0, 0);
      try { cx.filter = 'blur(' + (1.7 * u).toFixed(2) + 'px)'; } catch { /* noop */ }
      cx.fillStyle = dark ? 'rgba(6,9,6,1)' : 'rgba(84,74,52,1)';
      const m = this.model;
      const items = ((m?.bgItems || []) as never[]).concat((m?.plants || []) as never[]);
      this.shdJob = { key: shk, cvs: c, cx, items, i: 0 };
      this.shdBake = c; // 부분 완성분을 바로 그린다
    }
    const job = this.shdJob;
    const t0 = performance.now();
    while (job.i < job.items.length) {
      const it = job.items[job.i++];
      const cd = it.c || {};
      const dep = cd.dep == null ? 3 : cd.dep;
      const a = dep === 3 ? 0.22 : dep === 2 ? 0.1 : 0;
      if (a > 0) {
        const hp = +(cd.hp ?? 40);
        const sx = Math.abs(+(it.sx ?? 1));
        const w = Math.max(4, hp * 0.26 * sx);
        const h = Math.max(1.4, 2.4 + hp * 0.011);
        job.cx.globalAlpha = a;
        job.cx.beginPath();
        job.cx.ellipse((+(it.px ?? 0)) + w * 0.62, (+(it.py ?? 338.5)) + 1.2, w, h, -0.04, 0, Math.PI * 2);
        job.cx.fill();
      }
      if ((job.i & 31) === 0 && performance.now() - t0 > MeadowEngine.SLICE_MS) break;
    }
    if (job.i >= job.items.length) { this.shdBake = job.cvs; this.shdKey = shk; this.shdJob = null; }
    else this.dirty = true;
  }
  /** 배경·전경 스프라이트 베이크 — 프레임당 ~5ms씩 나눠 굽고, 부분 완성분을 그대로 그린다. */
  private bakeStep(kind: 'bg' | 'fg', bk: string, bw: number, bh: number, u: number, A: Atlas, list: BgItem[]) {
    let job = kind === 'bg' ? this.bgJob : this.fgJob;
    if (!job || job.key !== bk) {
      let cvs: HTMLCanvasElement;
      try {
        cvs = document.createElement('canvas');
        cvs.width = Math.max(1, bw | 0); cvs.height = Math.max(1, bh | 0);
      } catch { return; }
      const c = cvs.getContext('2d');
      if (!c) return;
      c.setTransform(u, 0, 0, u, 0, 0);
      job = { key: bk, cvs, c, list, i: 0 };
      if (kind === 'bg') { this.bgJob = job; this.bgBake = cvs; } else { this.fgJob = job; this.fgBake = cvs; }
    }
    const S = A.S, AT = A.cvs, meta = A.meta;
    const BLUR = this.ensureBlurAtlas(A) ?? AT;
    const t0 = performance.now();
    while (job.i < job.list.length) {
      const b = job.list[job.i++];
      let al = b.c.op;
      job.c.save();
      if (b.dep === 1) al *= 0.88;
      job.c.globalAlpha = Math.min(1, al);
      job.c.translate(b.px, b.py);
      job.c.scale(b.sx, b.sy);
      const m = meta[b.id];
      if (m) {
        const src = b.dep === 0 ? BLUR : AT;
        job.c.drawImage(src, m.ax * S, m.ay * S, m.w * S, m.h * S, m.x, m.y, m.w, m.h);
      }
      job.c.restore();
      if ((job.i & 15) === 0 && performance.now() - t0 > MeadowEngine.SLICE_MS) break;
    }
    if (job.i >= job.list.length) {
      if (kind === 'bg') { this.bgBake = job.cvs; this.bgKey = bk; this.bgJob = null; }
      else { this.fgBake = job.cvs; this.fgKey = bk; this.fgJob = null; }
    } else this.dirty = true;
  }
  /** dep 0용 블러 아틀라스를 준비한다(아틀라스가 바뀌면 다시 만든다). 실패하면 null. */
  private ensureBlurAtlas(A: Atlas): HTMLCanvasElement | null {
    // 아틀라스 자체에 매달아 둔다 — 아틀라스가 모듈 캐시에 남으므로 재마운트해도 재사용된다.
    if (A.blur !== undefined) return A.blur;
    try {
      const cvs = document.createElement('canvas');
      cvs.width = A.cvs.width;
      cvs.height = A.cvs.height;
      const c = cvs.getContext('2d');
      if (!c) { A.blur = null; return null; }
      c.filter = 'blur(' + (1.1 * A.S).toFixed(2) + 'px)';
      c.drawImage(A.cvs, 0, 0);
      A.blur = cvs;
      return cvs;
    } catch {
      A.blur = null;
      return null;
    }
  }
  /**
   * 배경/전경 장식 레이어를 그린다.
   *
   * 개화가 끝나기 전(2.23초 = 지연 최대 1.35 + 길이 최대 0.88)에는 항목마다 자기 지연·길이로
   * 하나씩 피워 올리고, 그 뒤로는 모두 최종 상태이므로 한 장으로 구워 drawImage 한 번으로 끝낸다.
   *
   * dep 0(가장 먼 배경)은 **미리 흐리게 구운 아틀라스 사본**에서 퍼 온다(ensureBlurAtlas).
   * 예전에는 그릴 때마다 ctx.filter = blur(...)를 걸었는데, 캔버스 필터는 드로우마다 별도
   * 레이어를 만드는 연산이라 단가가 일반 drawImage와 비교가 안 됐다.
   */
  private drawBgSet(ctx: CanvasRenderingContext2D, list: BgItem[], key: 'bg' | 'fg', now: number, bT: number | null, u: number, A: Atlas, bw: number, bh: number, t: number, wk: number) {
    if (!list || !list.length) return;
    if (this.reduce || (bT != null && (now - bT) / 1000 > MeadowEngine.BLOOM_S)) {
      const bk = bw + 'x' + bh + '|' + this.atlasKey;
      const curKey = key === 'bg' ? this.bgKey : this.fgKey;
      if (curKey !== bk) this.bakeStep(key, bk, bw, bh, u, A, list);
      const bake = key === 'bg' ? this.bgBake : this.fgBake;
      if (bake) {
        // 굽은 레이어는 지표선(y=339)을 축으로 살짝 기울여 한 덩어리로 바람을 탄다
        const k = this.reduce ? 0 : -(wk || 0) * this.gust(t, key === 'fg' ? 0.66 : 0.94);
        const y0 = 339 * u;
        ctx.setTransform(1, 0, k, 1, -k * y0, 0);
        ctx.drawImage(bake, 0, 0);
        ctx.setTransform(u, 0, 0, u, 0, 0);
      }
      return;
    }
    const S = A.S, AT = A.cvs, meta = A.meta;
    // dep 0은 미리 흐리게 구운 사본에서 퍼 온다. 준비 실패 시에만 원본을 쓰는데,
    // 그때는 블러가 안 걸릴 뿐 그림은 나온다 — 프레임을 떨구는 것보다 낫다.
    const BLUR = this.ensureBlurAtlas(A) ?? AT;
    for (const b of list) {
      let al = b.c.op, ty = 0, sxk = 1, syk = 1;
      if (!this.reduce) {
        if (bT == null) continue;
        const k = Math.min(1, Math.max(0, ((now - bT) / 1000 - b.bd) / b.bu));
        if (k <= 0) continue;
        const e = this.kfBloom(k);
        al *= e.o; ty = e.ty; sxk = e.sx; syk = e.sy;
      }
      ctx.save();
      if (b.dep === 1) al *= 0.88;
      ctx.globalAlpha = Math.min(1, al);
      ctx.translate(b.px, b.py + ty);
      ctx.scale(b.sx * sxk, b.sy * syk);
      const m = meta[b.id];
      if (m) {
        const src = b.dep === 0 ? BLUR : AT;
        ctx.drawImage(src, m.ax * S, m.ay * S, m.w * S, m.h * S, m.x, m.y, m.w, m.h);
      }
      ctx.restore();
    }
  }
  private drawGlow(ctx: CanvasRenderingContext2D, f: Firefly) {
    let g = f._glow;
    if (!g) {
      const gr = +f.gr, gry = +f.gry, cr = +f.cr, r0 = +f.r, K = 1.6;
      const W = Math.ceil(gr * 2.2 * K), H = Math.ceil(gry * 2.2 * K);
      const cvs = document.createElement('canvas');
      cvs.width = W; cvs.height = H;
      const c = cvs.getContext('2d')!;
      c.translate(W / 2, H / 2);
      c.save();
      c.scale(1, gry / gr);
      let gd = c.createRadialGradient(0, 0, 0, 0, 0, gr * K);
      gd.addColorStop(0, 'rgba(255,243,207,0.62)');
      gd.addColorStop(0.2, 'rgba(255,228,156,0.42)');
      gd.addColorStop(0.46, 'rgba(255,208,112,0.2)');
      gd.addColorStop(0.72, 'rgba(255,194,85,0.07)');
      gd.addColorStop(1, 'rgba(255,187,70,0)');
      c.fillStyle = gd;
      c.fillRect(-gr * K, -gr * K, gr * 2 * K, gr * 2 * K);
      c.restore();
      gd = c.createRadialGradient(0, 0, 0, 0, 0, cr * K);
      gd.addColorStop(0, 'rgba(255,253,242,0.9)');
      gd.addColorStop(0.3, 'rgba(255,240,182,0.5)');
      gd.addColorStop(1, 'rgba(255,224,131,0)');
      c.fillStyle = gd;
      c.beginPath(); c.arc(0, 0, cr * K, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,250,234,0.9)';
      c.beginPath(); c.arc(0, 0, r0 * K, 0, 6.2832); c.fill();
      g = f._glow = { cvs, w: W / K, h: H / K };
    }
    ctx.drawImage(g.cvs, -g.w / 2, -g.h / 2, g.w, g.h);
  }
  private drawFF(ctx: CanvasRenderingContext2D, band: number, dark: boolean, t: number) {
    if (!this.ffn2.length || !this.atlas) return;
    const base = this.reduce ? 1 : this.grown ? 1 : this.ffOp || 0;
    if (base <= 0.003) return;
    const seq = [0, 1, 2, 3, 4, 3, 2, 1];
    const mC = this.atlas.meta.bfF3;
    const pcx = mC ? mC.x + mC.w / 2 : 0, pcy = mC ? mC.y + mC.h / 2 : 0;
    for (const o of this.ffn2) {
      if (o.band !== band) continue;
      const F = o.f.nx;
      const fx = this.reduce ? 0 : this.flyX(F, t);
      const fy = this.reduce ? 0 : this.bobY(F, t);
      const x = o.bx + o.x + fx, y = o.by + o.y + fy;
      ctx.save();
      ctx.translate(x, y);
      if (dark) {
        ctx.globalAlpha = Math.min(1, base * (this.reduce ? 0.9 : o.boost ? 1 : this.flick(F, t)));
        this.drawGlow(ctx, o.f);
      } else {
        const dxT = x - (o.lastFx == null ? x : o.lastFx);
        o.lastFx = x;
        if (!this.reduce && Math.abs(dxT) > 0.02) {
          const sg = dxT > 0 ? 1 : -1;
          if (sg !== o.face) { if (++o.hold >= 4) { o.face = sg; o.hold = 0; } }
          else o.hold = 0;
        }
        ctx.globalAlpha = base;
        ctx.translate(pcx, pcy);
        ctx.rotate(F.brot * RAD);
        ctx.scale(F.bsc * o.face, F.bsc);
        ctx.translate(-pcx, -pcy);
        const fr = this.reduce ? 3 : seq[(8 - Math.floor(this.pmod((t - F.fdel) / F.fdur) * 8)) % 8];
        const m = this.atlas.meta['bfF' + fr];
        if (m) ctx.drawImage(this.atlas.cvs, m.ax * this.atlas.S, m.ay * this.atlas.S, m.w * this.atlas.S, m.h * this.atlas.S, m.x, m.y, m.w, m.h);
      }
      ctx.restore();
    }
  }
  private renderField(now: number) {
    const f = this.f, A = this.atlas, model = this.model;
    if (!f || !A || !model) return;
    const r = this.rect && this.rect.width ? this.rect : (this.rect = f.getBoundingClientRect());
    if (!r.width) return;
    // DPR 상한 1.5 — 2로 두면 백킹 스토어 픽셀이 1.8배가 되고 채우기 비용도 그만큼 는다.
    // 잔디·식물은 원래 흐릿한 실루엣이라 1.5에서 선명도 차이가 잘 드러나지 않는다.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(r.width * dpr)), bh = Math.max(1, Math.round(r.height * dpr));
    if (f.width !== bw) f.width = bw;
    if (f.height !== bh) f.height = bh;
    const ctx = f.getContext('2d')!;
    const u = bw / 1600;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(u, 0, 0, u, 0, 0);
    const S = A.S, AT = A.cvs, meta = A.meta;
    const dw = (id: string) => { const m = meta[id]; if (m) ctx.drawImage(AT, m.ax * S, m.ay * S, m.w * S, m.h * S, m.x, m.y, m.w, m.h); };
    if (!this.divCol) {
      try { this.divCol = getComputedStyle(f).getPropertyValue('--color-divider').trim() || '#d9dade'; } catch { this.divCol = '#d9dade'; }
    }
    ctx.strokeStyle = this.divCol;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(20, 339); ctx.lineTo(1580, 339); ctx.stroke();
    const dark = this.dark;
    // 캐스트 섀도 — 아틀라스/식물 수/캔버스 크기가 그대로면 베이크를 재사용, 성장 중에는 알파로 서서히
    const shk = bw + 'x' + bh + '|' + (this.atlasKey || '') + '|' + (this.model?.plants?.length || 0);
    if (this.shdKey !== shk) this.shadowStep(bw, bh, u, dark, shk);
    if (this.shdBake) {
      const gA = this.reduce || this.grown ? 1 : Math.max(0, Math.min(1, (this.p || 0) * 1.25));
      if (gA > 0.01) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = gA;
        ctx.drawImage(this.shdBake, 0, 0);
        ctx.globalAlpha = 1;
        ctx.setTransform(u, 0, 0, u, 0, 0);
      }
    }
    const t = (this.driftMs || 0) / 1000;
    this.drawFF(ctx, 0, dark, t);
    const bT = this.bloomT0;
    this.drawBgSet(ctx, model.bgItems, 'bg', now, bT, u, A, bw, bh, t, 0.007);
    this.drawFF(ctx, 1, dark, t);
    // 바람은 성장이 35%를 넘긴 뒤부터 서서히 실린다 (다 자라면 1)
    const gw = this.reduce ? 0 : this.grown ? 1 : Math.max(0, Math.min(1, ((this.p || 0) - 0.35) / 0.5));
    for (const p of model.plants) {
      if (p.elOp <= 0) continue;
      // x좌표에 비례한 위상 지연 → 바람이 왼쪽에서 오른쪽으로 지나간다
      const sw = gw > 0 ? gw * p.wam * 3.3 * this.gust(t, p.x * 0.00092 + (p.wph % 1) * 0.13) : 0;
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.scale(p.sx, p.sy);
      const a0 = Math.min(1, p.c.op * p.elOp);
      ctx.globalAlpha = a0;
      ctx.rotate((p.b1 + sw * 0.62) * RAD);
      ctx.scale(1, Math.max(0.001, p.sy1));
      ctx.save();
      ctx.translate(p.j1[0] * 0.5, p.j1[1] * 0.5);
      ctx.rotate((p.bm - p.b1 + p.lean * 0.4 + sw * 0.26) * RAD);
      ctx.translate(-p.j1[0] * 0.5, -p.j1[1] * 0.5);
      dw(p.i1);
      ctx.restore();
      ctx.save(); ctx.rotate(p.b2 * 0.7 * RAD); ctx.scale(p.sla, p.sla); dw(p.ia); ctx.restore();
      if (p.o2 > 0) {
        ctx.translate(p.j1[0], p.j1[1]);
        ctx.rotate((p.b2 + (p.bm - p.b1) * 0.6 + p.lean * 0.62 + sw * 0.34) * RAD);
        ctx.scale(1, Math.max(0.001, p.sy2));
        dw(p.i2);
        ctx.save(); ctx.rotate(p.b3 * 0.7 * RAD); ctx.scale(p.slb, p.slb); dw(p.ib); ctx.restore();
        if (p.o3 > 0) {
          ctx.translate(p.j2[0], p.j2[1]);
          ctx.rotate((p.b3 + p.lean * 0.8 + sw * 0.42) * RAD);
          ctx.scale(1, Math.max(0.001, p.sy3));
          dw(p.i3);
          if (p.ih && p.oh > 0) {
            ctx.globalAlpha = a0 * p.oh;
            ctx.translate(p.j3[0], p.j3[1]);
            ctx.rotate((p.b4 + p.lean * 0.45 + (1 - p.syh) * p.spin + sw * 0.5) * RAD);
            ctx.scale(Math.max(0.001, p.sch), Math.max(0.001, p.syh));
            dw(p.ih);
          }
        }
      }
      ctx.restore();
    }
    this.drawBgSet(ctx, model.fgItems, 'fg', now, bT, u, A, bw, bh, t, 0.0115);
    this.drawFF(ctx, 2, dark, t);
    if (this.xf) {
      const k = (now - (this.xfT0 || 0)) / 620;
      if (k >= 1 || this.reduce || !(this.p != null && this.p > 0)) { this.xf = null; }
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.max(0, 1 - (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
        try { ctx.drawImage(this.xf, 0, 0, bw, bh); } catch { this.xf = null; }
        ctx.globalAlpha = 1;
        ctx.setTransform(u, 0, 0, u, 0, 0);
        this.dirty = true;
      }
    }
  }
  private fieldLoop() {
    if (this.fRaf || !this.f) return;
    const minGap = 1000 / MeadowEngine.FIELD_FPS;
    const step = (now: number) => {
      this.fRaf = null;
      if (!this.f || !this.atlas) return;
      if (!this.vis) { this.fLast = 0; this.fDrawn = 0; return; }
      const last = this.fLast || now;
      this.fLast = now;
      // 시간은 **거른 프레임에서도** 쌓는다 — 그래야 바람이 실제 시간대로 흐른다.
      if (!this.ffPausedDrift && !this.reduce) this.driftMs = (this.driftMs || 0) + Math.min(120, now - last);
      // 감속 모션이면 원래도 dirty일 때만 그리므로 상한을 걸지 않는다(반응이 늦어질 뿐이다).
      const due = this.reduce || !this.fDrawn || now - this.fDrawn >= minGap - 1;
      if (!document.hidden && due) {
        const d = this.dirty;
        this.dirty = false;
        if (!this.reduce || d) {
          this.renderField(now);
          this.fDrawn = now;
        }
      }
      if (!this.reduce || this.dirty) this.fRaf = requestAnimationFrame(step);
    };
    this.fRaf = requestAnimationFrame(step);
  }
}

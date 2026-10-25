// 원본(handoff)은 './types'의 ContributionDay를 썼지만, 이 프로젝트의 실제 타입은
// features/profile/types.ts의 GithubContributionDay다(모양은 완전히 동일: {date, count}).
// 아래 로직(문서상 "수정 금지" 대상은 아님 — 이 import 한 줄만 실 프로젝트 타입에 맞춤)은 안 건드렸다.
import type { GithubContributionDay as ContributionDay } from './types';

/** 커밋 수 → 잔디 레벨 (시안 공통 스케일) */
export function levelOf(n: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return n <= 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 8 ? 3 : n <= 12 ? 4 : 5;
}

/** 오늘 포함 최근 53주(371일) 날짜 창 — 이번 주 토요일이 마지막 칸 */
export function window53(): string[] {
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const out: string[] = [];
  for (let i = 53 * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

/**
 * 다양한 기여 데이터 포맷을 ContributionDay[]로 정규화.
 * 허용: ① [{date,count}] ② {contributions:[[...주단위]]} ③ GitHub GraphQL contributionCalendar 원형
 * TODO(api): 백엔드가 포맷을 확정하면 해당 분기만 남기고 정리.
 */
export function flattenContributions(j: unknown): ContributionDay[] | null {
  if (!j) return null;
  type AnyDay = { date?: string; day?: string; count?: number; contributionCount?: number; value?: number };
  const o = j as Record<string, unknown>;
  const weeks = (((((o.data as Record<string, unknown>)?.user as Record<string, unknown>)?.contributionsCollection as Record<string, unknown>)?.contributionCalendar as Record<string, unknown>)?.weeks ?? []) as Array<{ contributionDays?: AnyDay[] }>;
  const days: AnyDay[] = Array.isArray(j)
    ? (j as AnyDay[])
    : Array.isArray(o.contributions)
      ? ([] as AnyDay[]).concat(...(o.contributions as AnyDay[][]))
      : weeks.reduce<AnyDay[]>((a, w) => a.concat(w.contributionDays ?? []), []);
  if (!days.length) return null;
  const out: ContributionDay[] = [];
  for (const d of days) {
    const date = d.date ?? d.day;
    const count = d.count ?? d.contributionCount ?? d.value;
    if (date) out.push({ date: String(date).slice(0, 10), count: Math.max(0, (count ?? 0) | 0) });
  }
  return out.length ? out : null;
}

/** 날짜별 기여를 53주 창의 371칸 배열로 매핑 (없는 날짜는 0) */
export function mapToWindow(days: ContributionDay[]): number[] {
  const map: Record<string, number> = {};
  for (const d of days) map[d.date] = d.count;
  return window53().map((dt) => map[dt] || 0);
}

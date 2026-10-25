import type { BadgeResponse } from './types'

/**
 * 업적 배지 — 서버 응답(BadgeResponse)을 화면이 쓰는 모양으로 옮긴다.
 *
 * 예전엔 이 파일이 배지를 **직접 계산했다**. 게시글 목록을 페이지네이션하며 상세 API로
 * 좋아요를 합산하고(N+1), 비용 때문에 골드 기준까지만 세고 멈춰 수치가 하한값이었다
 * ("30편 이상"). 백엔드에 조회 API가 생기면서(GET /api/users/{id}/badges) 그 계산이
 * 전부 서버로 갔고, 여기 남은 일은 표시용 문구·아이콘을 붙이는 것뿐이다.
 *
 * 서버는 **축별 최고 등급 하나씩**만 내려주지만(최대 4개), 화면에는 보유한 배지를 전부
 * 보여준다. 배지가 누적형이라 상위 등급을 땄으면 하위 등급도 딴 것이므로, 응답의
 * `current_value`를 임계값 표(BADGE_LADDER)와 대조해 하위 등급을 되살린다.
 */

export type AchievementTier = 'BRONZE' | 'SILVER' | 'GOLD'

export const TIER_LABELS: Record<AchievementTier, string> = {
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
}

/** 티어 서열 — 정렬 키로만 쓴다. 클수록 상위. */
const TIER_RANK: Record<AchievementTier, number> = { GOLD: 3, SILVER: 2, BRONZE: 1 }

export interface Achievement {
  /** 축 표시명("게시", "받은 좋아요" …) — 서버의 axis_label을 그대로 쓴다. */
  axis: string
  tier: AchievementTier
  name: string
  /** achievement-icons.ts의 키 — 배지 타일 안에 그릴 SVG */
  icon: string
  /** 툴팁 본문 — 달성 내용을 문장으로 */
  detail: string
  /** 툴팁 하단 라벨 — 현재 수치와 기준 */
  progress: string
}

/**
 * BadgeCode(서버 enum 이름) → 아이콘 키.
 *
 * **label이 아니라 code로 매핑한다.** 표시명은 기획에 따라 바뀔 수 있고, 백엔드가 code를
 * 따로 내려주는 이유가 바로 그것이다(BadgeResponse 주석). 새 코드가 생기면 여기에만 추가하면
 * 되고, 빠뜨려도 아래 축 기본값으로 떨어져 화면이 깨지지는 않는다.
 */
const ICON_BY_CODE: Record<string, string> = {
  POST_BRONZE: 'send',
  POST_SILVER: 'book',
  POST_GOLD: 'trophy',
  LIKE_BRONZE: 'heart',
  LIKE_SILVER: 'flame',
  LIKE_GOLD: 'star',
  COMMENT_BRONZE: 'msg',
  COMMENT_SILVER: 'bolt',
  COMMENT_GOLD: 'shield',
  GITHUB_BRONZE: 'check',
  GITHUB_SILVER: 'target',
  GITHUB_GOLD: 'code',
}

/** code를 모를 때의 축별 폴백 — 서버에 배지가 추가돼도 빈 타일이 되지 않게. */
const FALLBACK_ICON_BY_AXIS: Record<BadgeResponse['axis'], string> = {
  POST: 'send',
  LIKE: 'heart',
  COMMENT: 'msg',
  GITHUB: 'code',
}

/** 축별 수치 단위와 툴팁 문장. threshold를 넣어 "무엇을 달성했는지"를 적는다. */
const AXIS_COPY: Record<BadgeResponse['axis'], { unit: string; detail: (n: number) => string }> = {
  POST: { unit: '편', detail: (n) => `게시글 ${n}편을 작성했습니다.` },
  LIKE: { unit: '개', detail: (n) => `게시글이 좋아요 ${n}개를 받았습니다.` },
  COMMENT: { unit: '개', detail: (n) => `댓글 ${n}개를 남겼습니다.` },
  GITHUB: { unit: '일', detail: (n) => `최근 1년 동안 ${n}일 활동했습니다.` },
}

/** 서버가 모르는 축이 와도 화면이 죽지 않게 하는 기본값. */
const DEFAULT_COPY = { unit: '', detail: (n: number) => `기준 ${n}을 달성했습니다.` }

function toAchievement(
  axis: BadgeResponse['axis'],
  axisLabel: string,
  tier: AchievementTier,
  code: string,
  label: string,
  threshold: number,
  currentValue: number,
): Achievement {
  const copy = AXIS_COPY[axis] ?? DEFAULT_COPY
  return {
    axis: axisLabel,
    tier,
    name: label,
    icon: ICON_BY_CODE[code] ?? FALLBACK_ICON_BY_AXIS[axis] ?? 'star',
    detail: copy.detail(threshold),
    // 서버가 실제 수치를 주므로 예전의 "이상" 표기가 필요 없다.
    progress: `${currentValue}${copy.unit} · ${TIER_LABELS[tier]} 기준 ${threshold}${copy.unit}`,
  }
}

/**
 * 축별 배지 사다리 — 백엔드 BadgeCode enum(be-badge)의 사본이며 **티어 오름차순**이다.
 *
 * 서버는 축별 **최고 등급 하나씩**만 내려준다(최대 4개). 그런데 배지는 누적형이라
 * 실버를 땄으면 브론즈도 딴 것이고, 화면에는 보유한 걸 전부 보여주기로 했다. 그래서
 * 응답의 `current_value`를 이 표의 임계값과 대조해 하위 등급을 되살린다.
 *
 * ⚠️ 이 표는 서버 규칙의 복제본이다. 백엔드가 임계값이나 이름을 바꾸면 여기도 같이
 * 고쳐야 한다. 조용히 어긋나지 않도록 아래 expandAchievements가 응답과 대조해
 * 개발 모드에서 경고를 남긴다. 서버가 달성분 전체를 내려주게 되면 이 표는 지우면 된다.
 */
const BADGE_LADDER: Record<
  BadgeResponse['axis'],
  ReadonlyArray<{ code: string; label: string; tier: AchievementTier; threshold: number }>
> = {
  POST: [
    { code: 'POST_BRONZE', label: '첫 발자국', tier: 'BRONZE', threshold: 1 },
    { code: 'POST_SILVER', label: '꾸준한 기록', tier: 'SILVER', threshold: 10 },
    { code: 'POST_GOLD', label: '기록 장인', tier: 'GOLD', threshold: 30 },
  ],
  LIKE: [
    { code: 'LIKE_BRONZE', label: '관심의 시작', tier: 'BRONZE', threshold: 10 },
    { code: 'LIKE_SILVER', label: '인기 프로젝트', tier: 'SILVER', threshold: 50 },
    { code: 'LIKE_GOLD', label: '커뮤니티 등대', tier: 'GOLD', threshold: 200 },
  ],
  COMMENT: [
    { code: 'COMMENT_BRONZE', label: '첫 마디', tier: 'BRONZE', threshold: 10 },
    { code: 'COMMENT_SILVER', label: '번개 답변', tier: 'SILVER', threshold: 50 },
    { code: 'COMMENT_GOLD', label: '멘토', tier: 'GOLD', threshold: 200 },
  ],
  GITHUB: [
    { code: 'GITHUB_BRONZE', label: '잔디 심기', tier: 'BRONZE', threshold: 1 },
    { code: 'GITHUB_SILVER', label: '열정 커밋', tier: 'SILVER', threshold: 30 },
    { code: 'GITHUB_GOLD', label: '오픈소스 기여자', tier: 'GOLD', threshold: 100 },
  ],
}

/**
 * 응답(축별 최고 등급)을 **보유한 배지 전부**로 펼친다.
 *
 * 서버가 준 배지는 그대로 쓰고(그 축의 정본), 같은 축에서 `current_value`가 임계값을
 * 넘는 하위 등급을 표에서 되살린다. 표에 없는 code가 오면(배지가 새로 생긴 경우)
 * 그 배지만 그대로 통과시켜 화면이 비지 않게 한다.
 */
export function expandAchievements(badges: BadgeResponse[]): Achievement[] {
  const byCode = new Map<string, Achievement>()

  for (const badge of badges) {
    // 서버가 준 것은 무조건 포함 — 표를 못 믿는 상황에서도 최소한 이건 맞다.
    byCode.set(
      badge.code,
      toAchievement(
        badge.axis,
        badge.axis_label,
        badge.tier,
        badge.code,
        badge.label,
        badge.threshold,
        badge.current_value,
      ),
    )

    const ladder = BADGE_LADDER[badge.axis]
    if (!ladder) continue

    if (import.meta.env.DEV) {
      const known = ladder.find((entry) => entry.code === badge.code)
      if (known && known.threshold !== badge.threshold) {
        // 표가 낡았다는 뜻이다. 이걸 놓치면 하위 등급이 잘못된 기준으로 살아난다.
        console.warn(
          `[badges] ${badge.code} 임계값이 서버(${badge.threshold})와 프론트 표(${known.threshold})에서 다릅니다. achievements.ts의 BADGE_LADDER를 맞춰주세요.`,
        )
      }
    }

    for (const entry of ladder) {
      if (byCode.has(entry.code)) continue
      if (badge.current_value < entry.threshold) continue
      // 서버가 준 등급보다 **위**는 만들지 않는다. 백엔드가 임계값을 올리고 이 표를 안
      // 고치면(예: LIKE_GOLD 200 → 500) 프론트가 옛 기준으로 골드를 스스로 만들어 붙여,
      // 따지도 않은 배지가 프로필에 뜬다. 복원은 '서버 등급 아래를 되살리는 것'이 목적이다.
      if (TIER_RANK[entry.tier] > TIER_RANK[badge.tier]) continue
      byCode.set(
        entry.code,
        toAchievement(
          badge.axis,
          badge.axis_label,
          entry.tier,
          entry.code,
          entry.label,
          entry.threshold,
          badge.current_value,
        ),
      )
    }
  }

  return [...byCode.values()]
}

/**
 * 티어 내림차순(골드 → 실버 → 브론즈). 축은 정렬에 관여하지 않는다.
 * 같은 티어끼리는 서버가 준 순서가 유지된다 — Array.sort가 안정 정렬이라 0을 돌려주면 그대로다.
 */
export function sortAchievements(achievements: Achievement[]): Achievement[] {
  return [...achievements].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
}

/**
 * 태그 행 · 배지 행 맞춤 계산 (`프로필-화면-명세.md` 3·4절).
 *
 * 두 행은 **같은 실측 폭(`rowW`)** 을 나눠 쓴다. 폭 기준이 어긋나면 두 줄의 오른쪽 끝이
 * 안 맞는데, 명세가 "가장 흔한 실수"라고 못 박아 둔 지점이 정확히 이것이다. 그래서 계산을
 * 컴포넌트 안에 각자 두지 않고 이 파일에 모았고, 폭 측정은 useProfileIntro가 한 번만 해서
 * 양쪽에 같은 값을 내려 준다.
 */

/** 폭을 아직 못 쟀을 때 쓰는 기본값 — 첫 페인트에서 칩이 튀지 않게 명세가 정한 수치. */
export const FALLBACK_ROW_W = 520

/** 칩 간격 */
const GAP = 6
/** `+N` 칩의 예상 폭 */
const MORE = 46

/** 칩 폭 근사 — 패딩 24 + JetBrains Mono 11px 기준 글자당 7px (명세 3절 `tw()`). */
function chipWidth(label: string) {
  return 24 + label.length * 7
}

/**
 * 앞에서 `count`개를 넣었을 때 **2행 안에** 들어가는가 (명세 3절 `fits()`).
 * `withChip`이면 끝에 `+N` 칩 자리까지 확보해야 한다.
 */
function fits(labels: string[], count: number, withChip: boolean, W: number) {
  let row = 0
  let w = 0
  for (let i = 0; i < count; i++) {
    const cw = chipWidth(labels[i])
    const nw = w ? w + GAP + cw : cw
    if (nw > W) {
      row += 1
      if (row > 1) return false // 3행째 → 실패
      w = cw
      if (w > W) return false // 칩 하나가 한 행보다 넓다
    } else {
      w = nw
    }
  }
  if (withChip) {
    const nw = w ? w + GAP + MORE : MORE
    if (nw > W && row >= 1) return false
  }
  return true
}

/**
 * 태그를 몇 개까지 보여주고 몇 개를 `+N`으로 접을지 (명세 3절 결정 로직).
 * 전부 들어가면 `+N` 칩 없이 끝내고, 아니면 칩 자리를 확보한 채 개수를 줄여 나간다.
 */
export function tagFit(labels: string[], W: number): { shown: number; more: number } {
  if (fits(labels, labels.length, false, W)) return { shown: labels.length, more: 0 }
  let n = labels.length
  while (n > 0 && !fits(labels, n, true, W)) n -= 1
  return { shown: n, more: labels.length - n }
}

/**
 * 배지 타일을 몇 개까지 세울지 (명세 4절). 타일 48 + gap 10 = 58 기준으로 한 행에
 * 들어가는 개수를 구하고, 초과하면 타일 `B_MAX - 1`개 + `+N` 타일 1개로 접는다.
 */
export function badgeSplit(total: number, rowW: number): { shown: number; rest: number } {
  const bMax = Math.max(3, Math.floor(((rowW || FALLBACK_ROW_W) + 10) / 58))
  const rest = Math.max(0, total - (total > bMax ? bMax - 1 : bMax))
  return { shown: total - rest, rest }
}

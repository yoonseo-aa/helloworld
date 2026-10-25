import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { badgeSplit } from './row-fit'

/**
 * 프로필 진입 애니메이션 타임라인 (`프로필-화면-명세.md` 5절).
 *
 * 상태 3개로 굴러간다:
 *  - `intro`     인트로 진행 중인가 (끝나면 `+N` 숫자가 상시 스타일로 내려앉는다)
 *  - `moreN`     업적 `+N` 카운터의 현재 값
 *  - `revealSec` 0 → 1(깃허브 활동) → 2(게시글). 섹션·구분선 등장 단계.
 *
 * 명세 타임라인(마운트 = 0):
 *   1350ms      revealSec 1 + 카운트업 시작
 *   1350+560    revealSec 2
 *   카운트 종료 +1200ms   intro = false
 *
 * 폭 측정(`rowW`)도 여기서 한다 — 태그 행과 배지 행이 같은 폭을 봐야 오른쪽 끝이 맞기
 * 때문에(row-fit.ts) 측정 주체를 하나로 두고 두 컴포넌트에 같은 값을 내려 준다.
 */

/** 섹션 공개 시각 (명세 5.1). */
const REVEAL_AT = 1350
/** 두 번째 섹션까지의 간격. */
const REVEAL_GAP = 560
/** 카운트 종료 후 인트로를 끄기까지. */
const OUTRO_AFTER_COUNT = 1200

/**
 * 업적이 늦게 도착할 때 카운트업을 기다려 주는 여유 (1350ms 이후로 이만큼).
 *
 * 시안은 목 데이터라 마운트 순간 업적 개수를 이미 알았지만, 우리는 배지를 API로 받는다
 * (GET /api/users/{id}/badges). 1350ms에 딱 끊으면 응답이 늦은 날엔 카운트업이 통째로
 * 스킵돼 명세 5.2가 죽는다. 그래서 "접힌 배지 수가 정해지는 순간"에 시작하되 이 창 안에서만
 * 기다리고, 더 늦게 오면 연출 없이 최종 `+N`을 바로 그린다.
 *
 * (예전엔 프론트가 게시글을 훑어 배지를 직접 계산해서 훨씬 더 느렸다. 지금은 한 번의
 *  조회라 대개 1350ms 안에 들어오지만, 느린 회선을 위해 이 유예는 남겨 둔다.)
 */
const COUNT_GRACE = 2600

/** 카운트업 tick 간격 — 뒤로 갈수록 느려진다 (명세 5.2 `gap(i)`). */
function countGap(i: number, total: number) {
  return Math.round(200 + 820 * Math.pow(i / total, 2.2))
}

export function useProfileIntro(achievementCount: number) {
  const reduce = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  )
  // 감속 모션이면 마운트 즉시 최종 상태로 두고 타이머를 하나도 걸지 않는다 (명세 5.4).
  const [intro, setIntro] = useState(!reduce)
  const [moreN, setMoreN] = useState(reduce ? 99 : 0)
  const [revealSec, setRevealSec] = useState(reduce ? 2 : 0)
  const [rowW, setRowW] = useState(0)
  const rowRef = useRef<HTMLDivElement>(null)
  const mountedAt = useRef(performance.now())
  /** 카운트업 체인이 이미 돌고 있는가 — 리렌더마다 다시 걸리지 않게. */
  const counting = useRef(false)

  // 태그 행 실측. 2px 이하 변화는 무시해야 ResizeObserver ↔ 리렌더 루프에 빠지지 않는다
  // (명세 3절 "폭 측정"). 첫 값은 옵저버를 기다리지 않고 동기로 읽는다 — 첫 페인트에서
  // 배지가 잘못된 개수로 그려졌다가 다시 접히는 걸 막는다.
  // useEffect가 아니라 useLayoutEffect다 — 주석대로 '첫 페인트에서 잘못된 개수로
  // 그려지는 것'을 막으려면 측정이 페인트 **전에** 끝나야 한다. useEffect는 페인트
  // 이후에 돌아서, 캐시가 있는 프로필을 다시 열면 rowW=0인 첫 프레임이 실제로 보였다
  // (칩 0개 + '+N'만 떴다가 다음 프레임에 태그가 통째로 나타남).
  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    const read = () => {
      const w = Math.round(el.clientWidth)
      setRowW((prev) => (w > 0 && Math.abs(w - prev) > 2 ? w : prev))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** 접힌 배지 수 = 카운트업의 목표치 (명세 4절). */
  const bRest = badgeSplit(achievementCount, rowW).rest

  // ── 섹션 공개 체인 — 마운트 기준으로 고정이다(데이터와 무관하게 같은 리듬) ──
  useEffect(() => {
    if (reduce) return
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms))
    }
    later(() => {
      setRevealSec(1)
      later(() => setRevealSec(2), REVEAL_GAP)
    }, REVEAL_AT)
    // 카운트업이 끝내 시작되지 않으면(접힌 배지가 없거나 데이터가 너무 늦으면) 여기서 끈다.
    // 이 경우 `+N` 자체가 없거나 정적이라 인트로 종료 시점은 화면에 드러나지 않는다.
    later(() => {
      if (!counting.current) setIntro(false)
    }, REVEAL_AT + COUNT_GRACE)
    // 인트로는 setTimeout 체인이다 — 언마운트·StrictMode 이중 실행에서 통째로 해제한다
    // (명세 5.5). timers는 이 이펙트 실행분만 담으므로 두 번째 실행이 첫 번째를 지운다.
    return () => timers.forEach(clearTimeout)
  }, [reduce])

  // ── `+N` 카운트업 (명세 5.2) — 접힌 배지 수가 정해지는 순간 한 번만 건다 ──
  useEffect(() => {
    if (reduce || counting.current || bRest <= 0) return
    const elapsed = performance.now() - mountedAt.current
    // 유예 창을 넘겨 도착한 데이터는 연출 없이 최종 `+N`으로 그린다(AchievementBadges가
    // moreN < 2를 "카운트업 안 함"으로 읽는다).
    if (elapsed > REVEAL_AT + COUNT_GRACE) return

    counting.current = true
    const timers: Array<ReturnType<typeof setTimeout>> = []
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms))
    }

    later(() => {
      setMoreN(2)
      // 목표가 2 이하면 방금 넣은 값이 곧 마지막이다 — tick 없이 마무리한다.
      // (시안 원본은 이 경우에도 tick만 걸어 두는데, 첫 tick에서 k가 이미 total을 넘어
      //  그냥 return하므로 intro가 영영 안 꺼지고 카운터가 액센트 색에 굳어 버린다.)
      if (bRest <= 2) {
        later(() => setIntro(false), OUTRO_AFTER_COUNT)
        return
      }
      let k = 2
      const tick = () => {
        k += 1
        setMoreN(k)
        if (k >= bRest) {
          later(() => setIntro(false), OUTRO_AFTER_COUNT)
          return
        }
        later(tick, countGap(k, bRest))
      }
      later(tick, countGap(2, bRest))
      // 마운트 직후면 명세대로 1350ms를 기다리고, 데이터가 그보다 늦게 왔으면 즉시 시작한다.
    }, Math.max(0, REVEAL_AT - elapsed))

    return () => {
      timers.forEach(clearTimeout)
      // 가드도 같이 푼다 — StrictMode의 두 번째 실행에서 다시 걸려야 하고,
      // 리사이즈로 목표치가 바뀌면 새 목표로 다시 세는 게 맞다.
      counting.current = false
    }
  }, [reduce, bRest])

  return { intro, moreN, revealSec, reduce, rowW, rowRef }
}

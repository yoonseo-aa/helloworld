import { useCallback, useEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark'

/**
 * 저장 키. **토큰이 아니다** — 화면 취향이라 localStorage에 둬도 CLAUDE.md 규칙 1
 * (Access Token은 메모리에만)에 걸리지 않는다. 계정을 따라다니게 하려면 나중에
 * 서버 프로필로 옮기면 되고, 그때도 이 훅의 인터페이스는 그대로다.
 */
const STORAGE_KEY = 'hw-theme'

/**
 * 전환 표시(`data-theme-x`)를 유지하는 시간 — 색 보간 480ms + 여유 60ms.
 * index.css의 `html[data-theme-x]` 트랜지션 길이와 짝이라 한쪽만 바꾸면 어긋난다.
 */
const FADE_MS = 540

/** 저장값 → 없으면 OS 설정. index.html의 인라인 스크립트와 **같은 규칙**이어야 한다. */
function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // 시크릿 모드 등에서 localStorage 접근이 막힐 수 있다 — OS 설정으로 넘어간다.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * `<html data-theme>` 토글 — 앱에서 **한 번만** 쓴다(AppLayout).
 *
 * 상태를 Zustand가 아니라 DOM 속성에 두는 이유: 초원 엔진이 아틀라스를 구울 때
 * `document.documentElement.dataset.theme`를 직접 읽는 지점이 있어서
 * (meadow/engine.ts의 deepSwap) 스토어와 DOM이 어긋나면 식물 팔레트가 섞인다.
 * 속성 하나를 단일 진실로 두고, 읽는 쪽은 useThemeAttr이 구독한다.
 *
 * 첫 적용은 index.html의 인라인 스크립트가 이미 해뒀다(첫 페인트 전). 여기서는
 * 그 값을 이어받기만 하므로 화면이 밝았다 어두워지는 깜빡임이 없다. 그 스크립트가
 * 못 돌았을 경우만 아래 useEffect가 속성을 대신 채운다.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const applied = document.documentElement.getAttribute('data-theme')
    return applied === 'dark' || applied === 'light' ? applied : readInitialTheme()
  })
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /*
   * state → 속성 보정. 정상 경로에서는 index.html의 인라인 스크립트가 이미 같은 값을
   * 붙여놨고 toggle도 속성을 직접 쓰므로, 여기서 하는 일은 없다(값이 같아 건너뛴다).
   *
   * 필요한 건 인라인 스크립트가 아예 못 돌았을 때다 — CSP로 인라인이 차단되면
   * `<html>`에 data-theme이 없는 채로 뜨고, 그러면 저장값이 dark여도 화면은 라이트인데
   * 버튼만 해 아이콘으로 뜨는 어긋난 상태가 된다. 마운트 시 한 번 맞춰서 그 틈을 막는다.
   */
  useEffect(() => {
    const root = document.documentElement
    // 어긋났을 때만 쓴다 — toggle이 이미 같은 값을 써 둔 정상 경로에서는 건너뛴다.
    // (같은 값이어도 setAttribute는 MutationObserver 레코드를 만들어 useThemeAttr을 깨운다)
    if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme)
  }, [theme])

  // 언마운트 시 타이머 정리 — 남아 있으면 사라진 컴포넌트가 속성을 건드린다.
  useEffect(() => () => clearTimeout(fadeTimer.current), [])

  const toggle = useCallback(() => {
    const root = document.documentElement
    const next: Theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'

    // 전환 표시는 **바꾸기 직전에** 붙인다 — 붙기 전에 값이 바뀌면 보간 없이 튄다.
    if (!prefersReducedMotion()) {
      root.setAttribute('data-theme-x', '1')
      clearTimeout(fadeTimer.current)
      fadeTimer.current = setTimeout(() => root.removeAttribute('data-theme-x'), FADE_MS)
    }

    root.setAttribute('data-theme', next)
    setTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 저장 실패해도 이번 세션 동안은 적용된다.
    }
  }, [])

  return { theme, isDark: theme === 'dark', toggle }
}

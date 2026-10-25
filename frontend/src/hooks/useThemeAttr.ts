import { useEffect, useState } from 'react'

/**
 * `<html data-theme="dark">`를 구독하는 읽기 전용 훅.
 *
 * 값을 바꾸는 쪽은 useTheme(AppLayout의 토글 버튼)이고, 이 훅은 읽기만 한다.
 * 캔버스처럼 CSS 변수로 색이 안 따라오는 화면(초원·업적 배지)이 이걸 구독한다.
 *
 * 테마 소스를 Zustand 스토어가 아니라 DOM 속성으로 잡은 이유: 초원 엔진이 아틀라스를
 * 구울 때 `document.documentElement.dataset.theme`를 직접 읽는 지점이 있어서
 * (meadow/engine.ts의 deepSwap — 라이트에서만 올리브 팔레트를 갈아 끼운다) 스토어와
 * DOM이 어긋나면 식물 팔레트가 섞인다. 속성 하나를 단일 진실로 둔다.
 */
export function useThemeAttr(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  )

  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    read() // 초기 렌더와 이 이펙트 사이에 테마가 바뀌었을 수 있다
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return dark
}

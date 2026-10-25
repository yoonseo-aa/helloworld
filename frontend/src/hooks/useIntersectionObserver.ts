import { useEffect, useRef } from 'react'

/**
 * 반환한 ref를 단 요소가 뷰포트에 들어오면 onIntersect를 부른다 — 무한 스크롤 센티널용.
 * rootMargin 기본 200px: 바닥에 닿기 전에 미리 다음 페이지를 받아 끊김을 줄인다.
 */
export function useIntersectionObserver(
  onIntersect: () => void,
  {
    enabled = true,
    rootMargin = '200px',
  }: { enabled?: boolean; rootMargin?: string } = {},
) {
  const targetRef = useRef<HTMLDivElement>(null)
  // 콜백은 ref로 들고 있어 콜백이 바뀌어도 옵저버를 다시 만들지 않는다.
  const onIntersectRef = useRef(onIntersect)
  onIntersectRef.current = onIntersect

  useEffect(() => {
    const target = targetRef.current
    if (!enabled || !target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onIntersectRef.current()
      },
      { rootMargin },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [enabled, rootMargin])

  return targetRef
}

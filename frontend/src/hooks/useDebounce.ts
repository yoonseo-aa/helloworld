import { useEffect, useState } from 'react'

/** delay(ms) 동안 값이 안 바뀌면 그 값을 반환한다 — 검색어 입력 디바운스용. */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

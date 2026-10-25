import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search } from '@/components/icons'
import RecentSearchList from './RecentSearchList'

/**
 * 검색 바 + 최근 검색어 드롭다운 — 시안(AppShell Header)의 알약형 인풋.
 * AppLayout 스티키 헤더에 상주하므로 전 화면에서 같은 검색 진입을 쓴다.
 * 좌측 돋보기 아이콘 + 우측 ⌘K/Ctrl K 단축키 힌트(데스크톱), 제출은 Enter.
 * (시안 이식 전엔 홈 상단에 별도 바 + 주황 '검색' 버튼이었다 — 2026-08-05 교체)
 *
 * 검색 실행(Enter/최근 검색어 선택)은 항상 /search URL로의 내비게이션이다 —
 * "실행된 검색"의 단일 소스가 URL이므로 어디서 검색하든 같은 경로를 탄다.
 * 최근 검색어는 검색창 아래 오버레이로 뜬다 (2026-08-02 UX 변경, 네이버식).
 */
// navigator.platform은 deprecated(MDN) — UA 문자열로 Mac 계열만 판별한다 (단축키 표기용, 리뷰 반영).
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)

export default function SearchBar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlKeyword = (searchParams.get('keyword') ?? '').trim()
  const rawType = searchParams.get('type')

  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState(urlKeyword)
  const [open, setOpen] = useState(false)
  const [showMinLengthHint, setShowMinLengthHint] = useState(false)

  // 뒤로가기/앞으로가기로 실행된 검색어가 바뀌면 입력창도 맞춘다.
  useEffect(() => {
    setInput(urlKeyword)
  }, [urlKeyword])

  // 시안 헤더의 ⌘K/Ctrl K — 어디서든 검색창으로 포커스.
  // 전역 가로채기라 두 경우엔 양보한다 (리뷰 반영 — 다른 단축키·입력과의 충돌 방지):
  //  1) 모달이 떠 있을 때 — 검색바가 백드롭 뒤라 포커스를 뺏으면 포커스 트랩이 깨진다.
  //  2) 다른 입력 필드에 타이핑 중일 때(채팅 입력 등) — 작성 흐름을 끊지 않는다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      if (document.querySelector('[role="dialog"]')) return
      const active = document.activeElement
      const isTypingElsewhere =
        active instanceof HTMLElement &&
        active !== inputRef.current &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      if (isTypingElsewhere) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const goSearch = (keyword: string, type: string | null) => {
    setOpen(false)
    setShowMinLengthHint(false)
    const params = new URLSearchParams()
    params.set('keyword', keyword)
    if (type && type !== 'ALL') params.set('type', type) // 기본값은 URL을 깨끗하게 생략
    navigate(`/search?${params.toString()}`)
  }

  const submit = () => {
    const next = input.trim()
    if (next.length < 2) {
      setShowMinLengthHint(true)
      return
    }
    if (next === urlKeyword) {
      setOpen(false) // 같은 검색어 재제출 — 히스토리만 쌓이므로 무시
      return
    }
    goSearch(next, rawType)
  }

  return (
    // 드롭다운 기준점. onBlur는 포커스가 컨테이너 밖으로 나갈 때만 닫는다 —
    // 드롭다운 안의 버튼 클릭은 relatedTarget이 내부라 닫히지 않는다.
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Search
          size={15}
          className="text-ink/[.45] pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          ref={inputRef}
          type="search"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setShowMinLengthHint(false)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            // 한글 조합을 확정하는 Enter가 제출로 번지지 않게.
            // keyCode 229는 폐기된 속성이지만 의도적으로 유지 — Safari는 조합 확정
            // Enter를 compositionend 이후에 쏴서 isComposing이 false라 이것만으로
            // 잡아야 한다 (Chrome은 isComposing으로 충분).
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
              e.preventDefault()
            }
          }}
          placeholder="프로젝트, 개발자, 기술 스택 검색..."
          aria-label="검색"
          // 브라우저 기본 지우기(X)는 숨긴다 — 우리 드롭다운 UX와 겹쳐 혼란스럽다.
          // placeholder 색은 시안이 브라우저 기본값(darkgray #a9a9a9)을 그대로 쓴다 —
          // Tailwind preflight가 currentColor 50%로 덮으므로 명시해야 시안과 같아진다.
          className="border-line-strong bg-surface/[.76] text-ink placeholder:text-[#a9a9a9] focus:border-brand h-11 w-full rounded-[10px] border pr-3 pl-9 text-[13.5px] outline-none md:h-[38px] md:pr-[70px] [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="border-line text-ink/[.48] bg-surface/70 pointer-events-none absolute top-1/2 right-[7px] hidden -translate-y-1/2 rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums md:block">
          {IS_MAC ? '⌘ K' : 'Ctrl K'}
        </kbd>
      </form>

      {open && (
        // onMouseDown preventDefault: 클릭해도 input이 blur되지 않게 — Safari는 버튼
        // 클릭 시 포커스를 주지 않아 relatedTarget이 null이 되고, blur 닫힘이 클릭보다
        // 먼저 실행돼 항목 클릭이 증발한다. 포커스를 안 뺏으면 닫힘 판정 자체가 없다.
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="border-line bg-surface absolute inset-x-0 top-full z-20 mt-2 rounded-xl border p-2 shadow-lg"
        >
          <RecentSearchList
            onSelect={(recent) => goSearch(recent.keyword, recent.search_type)}
          />
        </div>
      )}

      {/* 헤더 높이가 흔들리지 않게 힌트는 오버레이로 띄운다 */}
      {showMinLengthHint && (
        <p className="text-danger bg-surface border-line absolute top-full left-0 z-20 mt-2 rounded-lg border px-3 py-1.5 text-xs shadow-sm">
          두 글자 이상 입력해주세요.
        </p>
      )}
    </div>
  )
}

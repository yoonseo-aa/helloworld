import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * 공통 모달 셸 — 백드롭·ESC 닫기·dialog 접근성·포커스 관리를 한곳에서 책임진다.
 * PostComposerModal·FollowListModal 두 사용처가 생겨 승격했다 (CLAUDE.md 배치 규칙).
 *
 * - 닫기 판정은 click이 아니라 mousedown 기준 — click은 mousedown·mouseup의 공통
 *   조상에서 발화하므로, 모달 안 텍스트를 드래그하다 밖에서 놓으면 백드롭 click으로
 *   판정되어 작성 내용이 날아간다.
 * - ESC는 IME 조합 중이면 무시한다 — 한글 조합 취소가 모달 닫기로 번지지 않게.
 * - 열리면 패널로 포커스 이동, Tab은 패널 안에서 순환, 닫히면 열었던 요소로 복원.
 * - 모달 위에 모달이 열릴 수 있다 (게시글 상세 → 좋아요 목록). ESC·Tab은 **최상단
 *   모달만** 반응해야 해서 열린 순서를 모듈 스택으로 추적한다 — 안 그러면 ESC 한 번에
 *   두 모달이 같이 닫히고, Tab 순환은 아래 모달이 포커스를 계속 뺏는다.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** 지금 열려 있는 모달들 (아래 → 위 순). 각 인스턴스는 마운트 시 자신의 식별자를 쌓는다. */
const openModalStack: object[] = []

export default function Modal({
  onClose,
  label,
  className = '',
  bare = false,
  children,
}: {
  /** 닫기 요청 (ESC·백드롭). 확인 대화상자 등 닫을지 말지는 호출 쪽이 결정한다. */
  onClose: () => void
  /** 스크린리더가 읽는 대화상자 이름. */
  label: string
  /** 패널에 더할 클래스 — 폭·높이 지정용 (예: 'max-w-lg'). */
  className?: string
  /** true면 기본 패딩(p-6)을 뺀다 — 게시글 상세처럼 내부를 영역으로 꽉 나누는 모달용. */
  bare?: boolean
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // 리스너를 매번 다시 달지 않도록 onClose는 ref로 참조한다.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // 모달 스택에서 이 인스턴스를 가리키는 식별자 (내용 없는 고유 객체면 충분).
  const stackIdRef = useRef({})

  // 열리면 스택에 쌓고, 닫히면 뺀다 — ESC·Tab 처리에서 "내가 최상단인가"를 판정하는 근거.
  useEffect(() => {
    const id = stackIdRef.current
    openModalStack.push(id)
    return () => {
      const index = openModalStack.indexOf(id)
      if (index >= 0) openModalStack.splice(index, 1)
    }
  }, [])

  // 열릴 때 패널로 포커스를 옮기고, 닫히면 열었던 요소로 되돌린다.
  useEffect(() => {
    const opener = document.activeElement
    panelRef.current?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  // 모달이 떠 있는 동안 뒤 화면(body) 스크롤을 잠근다 — 모달 안만 스크롤되게.
  //
  // 잠그면 스크롤바가 사라지면서 본문이 옆으로 밀릴 수 있다. 보정량을 스크롤바 폭으로
  // 미리 계산하지 않고 **잠근 전후의 실제 폭 차이**로 잰다 — index.css의
  // `scrollbar-gutter: stable`이 자리를 계속 잡아 주는 환경에서는 잠가도 폭이 그대로라
  // 보정이 필요 없는데, 폭을 미리 계산하면 없는 이동을 보정하다 오히려 반대로 밀린다.
  useEffect(() => {
    const { style } = document.body
    const prevOverflow = style.overflow
    const prevPaddingRight = style.paddingRight
    const widthBeforeLock = document.documentElement.clientWidth
    style.overflow = 'hidden'
    const shift = document.documentElement.clientWidth - widthBeforeLock
    if (shift > 0) style.paddingRight = `${shift}px`
    return () => {
      style.overflow = prevOverflow
      style.paddingRight = prevPaddingRight
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 위에 다른 모달이 얹혀 있으면 키 처리는 그 모달의 몫이다.
      if (openModalStack[openModalStack.length - 1] !== stackIdRef.current) return
      if (e.key === 'Escape') {
        // IME 조합을 취소하는 ESC가 window까지 버블되는 브라우저 대응 (keyCode 229 포함).
        if (e.isComposing || e.keyCode === 229) return
        onCloseRef.current()
        return
      }
      // 포커스 트랩: Tab이 모달 밖(뒤 화면)으로 나가지 않게 패널 안에서 순환시킨다.
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        )
        if (focusables.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey) {
          // `active === panel`을 빠뜨리면 안 된다 — 모달은 열릴 때 tabIndex=-1 패널로
          // 포커스를 옮기는데, 그 상태에서는 active가 first도 아니고 panel.contains(panel)이
          // true라 두 조건이 다 거짓이 된다. preventDefault가 안 걸려 브라우저 기본 동작으로
          // 뒤 화면의 포커서블로 빠져나갔다(열자마자 Shift+Tab 한 번이면 재현).
          if (active === first || active === panel || !panel.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else if (active === last || !panel.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    // 백드롭 틴트·블러와 등장 모션(hw-mfade/hw-mrise)은 시안 모달 값 그대로 (index.css).
    //
    // z-80의 근거 — 앱 전역 레이어 사다리는 이렇다:
    //   30 피드 스티키 탭 · 40 헤더/저장 바 · 50 데스크톱 레일 · 60 모바일 탭바
    //   70 레일 hover 라벨 · **80 모달** · 90 토스트·연결 실패 배너
    // 예전엔 z-50이라 모바일 탭바(z-[60])가 백드롭 위에 그려졌다. Modal은 portal을 쓰지
    // 않고 페이지 트리 안에 그대로 렌더되는데 중간 조상에 stacking context가 없어서
    // 루트에서 60 > 50으로 비교됐고, 모달을 띄운 채 화면 아래를 누르면 백드롭이 아니라
    // 탭바 링크가 눌려 페이지가 이동하며 작성 중이던 내용이 통째로 사라졌다.
    // 토스트(90)보다는 아래에 둔다 — 모달 안에서 한 동작의 결과를 토스트가 알려야 한다.
    <div
      className="hw-mfade fixed inset-0 z-80 flex items-center justify-center bg-[#0b0c0e]/[.58] p-4 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`hw-mrise bg-surface w-full rounded-[18px] shadow-xl outline-none ${bare ? '' : 'p-6'} ${className}`}
      >
        {children}
      </div>
    </div>
  )
}

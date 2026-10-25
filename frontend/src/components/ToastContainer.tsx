import { useToastStore } from '@/stores/useToastStore'

/**
 * 앱 전역 토스트 — main.tsx에 1개만 마운트해서 어느 화면에서든(셸 안팎 무관) 뜬다.
 *
 * 생김새는 시안(handoff components/Toast) 그대로다: 하단 중앙, neutral-900 배경 +
 * neutral-100 글씨(우리 토큰으로 ink/surface), 13.5px, radius 10, shadow-lg.
 * **성공/실패로 색을 바꾸지 않는다** — 시안 토스트는 한 가지 모양뿐이고, 주황 칩을
 * 화면 위쪽에 띄우던 예전 방식은 브랜드색을 알림색으로 오해하게 만들었다.
 * type은 색이 아니라 aria-live 강도(실패는 assertive)로만 쓴다.
 *
 * 세로 위치는 `--hw-toast-bottom`으로 정한다(index.css에 기본값: 모바일 86px = 하단
 * 탭바 위, 데스크톱 36px = 시안 기본값). 하단 고정 바가 있는 화면(프로필 편집의 저장 바)은
 * 그 변수만 올려서 바를 피한다 — 토스트가 전역이라 페이지가 직접 위치를 넘길 수 없다.
 *
 * 한 번에 하나만 뜬다 — 새 메시지가 오면 이전 것을 밀어낸다(useToastStore 주석 참고).
 * 클릭하면 자동 소멸(3.5초)을 기다리지 않고 바로 닫힌다.
 */
export default function ToastContainer() {
  const toast = useToastStore((state) => state.toast)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    // 컨테이너는 **항상** 렌더한다. 토스트가 뜰 때 컨테이너째로 새로 만들면 라이브 리전이
    // 내용과 동시에 생겨서 스크린리더가 변화를 못 잡는 경우가 있다 — 리전을 미리 만들어
    // 두고 안쪽만 갈아끼워야 낭독된다.
    <div
      role="status"
      aria-live={toast?.type === 'error' ? 'assertive' : 'polite'}
      className="pointer-events-none fixed inset-x-0 bottom-[var(--hw-toast-bottom)] z-[90] flex justify-center px-4"
    >
      {toast && (
        <button
          // key로 문구가 바뀔 때 요소를 새로 만든다 — 같은 문구가 연달아 떠도 갱신이 보인다.
          key={toast.id}
          type="button"
          aria-label={'알림 닫기: ' + toast.message}
          onClick={dismiss}
          className="bg-ink text-surface pointer-events-auto max-w-[min(90vw,540px)] rounded-[10px] px-5 py-[11px] text-center text-[13.5px] break-keep shadow-lg"
        >
          {toast.message}
        </button>
      )}
    </div>
  )
}

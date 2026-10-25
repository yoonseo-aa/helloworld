import { create } from 'zustand'

export interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface ToastState {
  /** 지금 떠 있는 토스트. 한 번에 하나만 둔다(아래 주석). */
  toast: Toast | null
  show: (type: Toast['type'], message: string) => void
  dismiss: () => void
}

const AUTO_DISMISS_MS = 3500

let nextId = 0

/**
 * 화면 어디서든(사이드바 셸 안팎 상관없이) 띄우는 짧은 알림.
 * GitHub 연동 결과처럼 "풀 페이지 리다이렉트로 돌아온 직후" 보여줄 일회성 메시지가
 * 필요해서 만들었다 — 외부 라이브러리 없이 Zustand + 컴포넌트 하나로 충분한 규모다.
 *
 * **한 번에 하나만 띄운다.** 새 메시지가 오면 이전 것을 교체하고 타이머도 다시 잡는다.
 * 예전에는 배열에 쌓아 위로 겹쳐 올렸는데, 이 앱은 토스트가 동시에 두 개 뜰 일이
 * 거의 없고(대부분 사용자가 방금 누른 버튼 하나의 결과다), 겹쳐 쌓이면 방금 뜬 게
 * 어느 쪽인지 눈으로 좇아야 한다.
 *
 * 업계도 갈린다 — Material Design·Apple HIG는 "한 번에 하나"(새 것이 기존 것을 교체하거나
 * 큐로 대기)를 명시하고, 최근 웹에서 많이 쓰는 토스트 라이브러리(sonner, react-hot-toast 등)와
 * 그걸 쓰는 서비스들은 쌓아 올린다. 후자는 백그라운드 작업 여러 건이 각자 끝나는 화면
 * (배포·업로드 대시보드 등)을 전제로 한 방식이라 우리와 맞지 않는다.
 * 결정적으로 **디자인 시안(handoff lib/useToast)이 단일 슬롯 교체 방식**이라 거기 맞춘다.
 */
export const useToastStore = create<ToastState>((set) => {
  /**
   * 자동 소멸 타이머. 새 토스트가 이전 것을 밀어낼 때 같이 갈아끼운다.
   *
   * 모듈 스코프가 아니라 **이 스토어의 클로저**에 둔다. 값 자체는 화면에 안 그리므로
   * 스토어 상태(set)에 넣을 이유가 없고(넣으면 불필요한 갱신만 는다), 클로저에 두면
   * 스토어 인스턴스와 수명이 같아져 "누가 이 타이머의 주인인가"가 코드로 드러난다.
   */
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    toast: null,
    show: (type, message) => {
      if (timer) clearTimeout(timer)
      // id는 화면 갱신용 key다 — 같은 문구가 연달아 떠도 다른 요소로 갈리게 해서
      // "새로 떴다"가 보이게 한다.
      set({ toast: { id: nextId++, type, message } })
      timer = setTimeout(() => {
        timer = null
        set({ toast: null })
      }, AUTO_DISMISS_MS)
    },
    dismiss: () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      set({ toast: null })
    },
  }
})

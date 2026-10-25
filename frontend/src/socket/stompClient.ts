import { Client, type IMessage } from '@stomp/stompjs'
import { useSyncExternalStore } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'

/**
 * 앱 전역 STOMP 연결 1개를 관리한다 (CLAUDE.md 규칙 5 — 컴포넌트·페이지 단위로 새로
 * 만들지 않는다). main.tsx가 useAuthStore의 accessToken 변화(null↔값)를 구독해서
 * connectStomp/disconnectStomp를 호출한다 — 특정 페이지 마운트에 묶지 않는 이유는,
 * 로그인 직후 온보딩(/settings/profile)처럼 사이드바(AppLayout) 밖에서도 연결이
 * 유지돼야 하기 때문이다.
 *
 * ⚠️ 백엔드에 /ws 엔드포인트가 아직 없다 — 이 파일은 명세(WebSocket 연결 수립) 기준으로
 * 미리 짜둔 것이고, 실제로 연결 테스트는 못 해봤다. 백엔드가 뜨면 제일 먼저 확인할 것.
 */

const MAX_RECONNECT_ATTEMPTS = 5
const INITIAL_RECONNECT_DELAY_MS = 1000

export type StompConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

type StatusListener = (status: StompConnectionStatus) => void
type PersonalMessageListener = (payload: unknown) => void
type ErrorMessageListener = (payload: unknown) => void

/**
 * STOMP 처리 중 내 요청만 실패했을 때 서버가 개인 에러 큐(/user/queue/errors)로
 * 돌려주는 프레임. REST 에러 봉투와 필드를 맞췄다(백엔드 ChatStompErrorResponse 주석
 * 참고) — 상태 코드만 없다.
 */
export interface StompErrorPayload {
  status: 'ERROR'
  code: string
  message: string
}

let client: Client | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let status: StompConnectionStatus = 'idle'

const statusListeners = new Set<StatusListener>()
// 개인 큐는 채팅·알림이 payload 종류로 나눠 같이 쓴다 — 각 feature가 여기 등록해서 받는다.
const personalMessageListeners = new Set<PersonalMessageListener>()
// 개인 에러 큐 — /user/queue/updates와 별도 주소(백엔드가 STOMP 규격상 분리해서 보낸다).
const errorMessageListeners = new Set<ErrorMessageListener>()

function setStatus(next: StompConnectionStatus) {
  status = next
  statusListeners.forEach((listener) => listener(status))
}

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

function subscribePersonalQueue() {
  client?.subscribe('/user/queue/updates', (message: IMessage) => {
    try {
      const payload: unknown = JSON.parse(message.body)
      personalMessageListeners.forEach((listener) => listener(payload))
    } catch {
      // 파싱 안 되는 프레임은 무시 — 리스너 하나가 죽는다고 나머지까지 끊기면 안 된다.
    }
  })
}

function subscribeErrorQueue() {
  client?.subscribe('/user/queue/errors', (message: IMessage) => {
    try {
      const payload: unknown = JSON.parse(message.body)
      errorMessageListeners.forEach((listener) => listener(payload))
    } catch {
      // 파싱 안 되는 프레임은 무시.
    }
  })
}

function scheduleReconnect() {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    setStatus('failed') // 더 이상 자동 재시도 안 함 — UI가 "새로고침 해주세요" 안내.
    return
  }
  setStatus('reconnecting')
  // 앞서 잡아둔 타이머가 남아 있으면 버린다 — onStompError와 onWebSocketClose가 잇달아
  // 오면 예약이 겹쳐 같은 시각에 connectStomp가 두 번 불릴 수 있다.
  if (reconnectTimer) clearTimeout(reconnectTimer)
  const delay = INITIAL_RECONNECT_DELAY_MS * 2 ** reconnectAttempt // 1s→2s→4s→8s→16s
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    // 재시도 시점의 "현재" 토큰을 다시 읽는다(명세: 검증 실패 시 토큰 재발급 후 재시도) —
    // 처음 연결할 때 쓴 토큰을 그대로 재사용하면, 그게 만료된 게 원인이었을 경우
    // 5번 다 똑같은 이유로 실패한다. api/client.ts의 401 인터셉터가 그 사이 다른
    // 요청으로 이미 재발급을 끝냈을 수도 있어서, 스토어에서 최신 값을 읽는 것만으로도
    // 도움이 된다. 로그아웃해서 토큰 자체가 없어졌으면 재연결을 포기한다.
    const currentToken = useAuthStore.getState().accessToken
    if (!currentToken) {
      setStatus('idle')
      return
    }
    connectStomp(currentToken)
  }, delay)
}

/**
 * 전역 연결을 수립한다. 이미 연결(시도) 중이면 아무 것도 안 한다 — 여러 곳에서 실수로
 * 중복 호출해도 안전하다.
 */
export function connectStomp(accessToken: string) {
  if (client) return

  setStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

  /*
   * 아래 콜백들은 **자기를 만든 클라이언트가 아직 현역일 때만** 동작해야 한다.
   *
   * deactivate()는 즉시 끝나지 않아서, 정리한 옛 연결의 onWebSocketClose가 새 연결을
   * 만든 뒤에 도착할 수 있다. 그때 콜백이 전역 `client`를 그냥 null로 밀면 방금 만든
   * 멀쩡한 클라이언트의 참조가 사라진다 — 소켓은 살아서 구독을 계속 받는데 코드는
   * 그 존재를 모르니, 다음 connectStomp가 `if (client) return` 가드를 통과해 연결이
   * 하나 더 생기고 개인 큐가 이중으로 구독된다(같은 알림이 두 번 뜬다).
   * 지역 변수로 자기 인스턴스를 붙잡아 두고 매 콜백 첫 줄에서 대조한다.
   */
  let self: Client | null = null

  const isStale = () => client !== self

  self = new Client({
    brokerURL: socketUrl(),
    // STOMP CONNECT 프레임 헤더로 인증한다 — HTTP Authorization 헤더가 아니다.
    // 핸드셰이크(HTTP Upgrade) 요청 자체엔 브라우저가 커스텀 헤더를 못 붙이기 때문.
    connectHeaders: { Authorization: `Bearer ${accessToken}` },
    // 내장 재연결(고정 딜레이) 대신 지수 백오프를 직접 제어하려고 끈다.
    reconnectDelay: 0,
    onConnect: () => {
      if (isStale()) return
      reconnectAttempt = 0
      setStatus('connected')
      subscribePersonalQueue()
      subscribeErrorQueue()
    },
    onStompError: () => {
      if (isStale()) return
      /*
       * CONNECT 검증 실패(토큰 만료 등). 재발급은 이 모듈의 책임이 아니다
       * (순환 의존 방지 — api/client.ts가 재발급을 담당).
       *
       * 예전엔 여기서 연결만 정리하고 "다음 connectStomp 호출 때 다시 시도된다"고
       * 적어 뒀는데, **그 호출을 하는 곳이 없었다.** 로그인 경계(main.tsx)는 토큰이
       * null→값으로 바뀔 때만 연결하므로, 이미 로그인된 상태에서 토큰이 만료돼
       * CONNECT가 거절되면 재발급이 끝나도 소켓은 영영 끊긴 채였고 새로고침 말고는
       * 복구할 방법이 없었다. 그래서 여기서도 재연결 스케줄에 태운다 — 재시도 시점에
       * 스토어에서 최신 토큰을 다시 읽으므로(scheduleReconnect) 그 사이 재발급이
       * 끝났으면 새 토큰으로 붙는다.
       */
      void self?.deactivate()
      client = null
      scheduleReconnect()
    },
    onWebSocketClose: () => {
      // 이미 교체된 옛 인스턴스의 뒤늦은 close는 무시한다(위 isStale 주석 참고).
      if (isStale()) return
      // status가 'idle'이면 disconnectStomp()로 의도된 종료 — 재연결 안 한다.
      if (status === 'idle') return
      // ⚠️ 버그 수정: 여기서 client를 비워주지 않으면, 잠시 뒤 scheduleReconnect가
      // connectStomp()를 다시 불러도 위쪽의 `if (client) return` 가드에 걸려서
      // 아무 일도 안 일어난다 — 겉으로는 재연결을 시도하는 것처럼 보이지만 실제로는
      // 5번 다 헛도는 것이었다. 일반적인 네트워크 끊김(가장 흔한 재연결 사유)이
      // onStompError를 거치지 않고 곧장 여기로 오기 때문에 특히 치명적이었다.
      client = null
      scheduleReconnect()
    },
  })

  client = self
  client.activate()
}

/** 로그아웃 시 호출. 재연결 타이머를 멈추고 연결을 정리한다. */
export function disconnectStomp() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  setStatus('idle') // onWebSocketClose가 재연결을 안 걸도록 deactivate 전에 먼저 바꾼다.
  client?.deactivate()
  client = null
  reconnectAttempt = 0
}

/** 개인 큐 메시지 콜백 등록. 구독 해제 함수를 돌려준다. */
export function onPersonalMessage(listener: PersonalMessageListener): () => void {
  personalMessageListeners.add(listener)
  return () => personalMessageListeners.delete(listener)
}

/** 개인 에러 큐(/user/queue/errors) 콜백 등록. 구독 해제 함수를 돌려준다. */
export function onPersonalErrorMessage(listener: ErrorMessageListener): () => void {
  errorMessageListeners.add(listener)
  return () => errorMessageListeners.delete(listener)
}

function subscribeStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/**
 * React 밖(main.tsx 초기화 코드)에서 연결 상태 변화를 구독한다 — 연결(최초·재연결)
 * 성공 시 DM 뱃지를 서버 값으로 재동기화하는 데 쓴다. 해제 함수를 돌려준다.
 */
export function onStompStatusChange(listener: StatusListener): () => void {
  return subscribeStatus(listener)
}

/** 연결 상태 구독 — 5회 재연결 실패("failed") 시 안내 배너 등에 쓴다. */
export function useStompConnectionStatus(): StompConnectionStatus {
  return useSyncExternalStore(subscribeStatus, () => status)
}

/**
 * 방 topic 등 개인 큐 밖의 임의 destination을 구독하려는 feature(예: 채팅방)가
 * 직접 client.subscribe()를 호출할 수 있게 인스턴스를 내준다.
 * socket/useSubscription.ts 정도만 이걸 쓰고, 다른 곳에서 직접 쓰지 않는다.
 */
export function getStompClient(): Client | null {
  return client
}

/**
 * SEND 프레임을 보낸다(fire-and-forget — STOMP SEND엔 응답이 없다). 연결 안 돼있으면
 * 아예 시도하지 않고 false를 돌려준다 — 호출한 쪽(예: 메시지 전송)이 그 자리에서
 * 바로 실패로 처리할 수 있게.
 */
export function publishStomp(destination: string, body: unknown): boolean {
  if (!client || status !== 'connected') return false
  client.publish({ destination, body: JSON.stringify(body) })
  return true
}

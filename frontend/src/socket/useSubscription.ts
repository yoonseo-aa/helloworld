import { useEffect, useRef } from 'react'
import { getStompClient, useStompConnectionStatus } from './stompClient'

/**
 * 임의 STOMP destination(예: 방 topic)을 구독한다. 컴포넌트가 마운트/destination이
 * 바뀌면 구독하고, 언마운트/destination이 바뀌면 그 전 구독을 해제한다 —
 * 채팅방 입장 시 구독, 퇴장 시 해제(CLAUDE.md 규칙 5)가 이걸로 된다.
 *
 * 연결 상태(status)도 effect 의존성에 넣어서, 재연결 성공("connected")마다 다시
 * 구독한다 — STOMP 구독은 연결에 종속돼서 끊기면 소멸하기 때문에, 재연결 후엔
 * 새로 구독하지 않으면 그 방의 실시간 메시지를 다시는 못 받는다.
 *
 * destination이 null이면 구독하지 않는다(예: roomId가 아직 없을 때).
 */
export function useSubscription(
  destination: string | null,
  onMessage: (payload: unknown) => void,
) {
  const status = useStompConnectionStatus()
  // onMessage가 렌더마다 새 함수여도 effect가 다시 도는(=재구독하는) 일이 없게 ref로 최신값만 참조한다.
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!destination || status !== 'connected') return

    const client = getStompClient()
    if (!client) return

    const subscription = client.subscribe(destination, (message) => {
      let payload: unknown
      try {
        payload = JSON.parse(message.body)
      } catch {
        // 파싱 안 되는 프레임만 무시. 핸들러 자체의 에러는 여기서 삼키지 않는다 —
        // 삼키면 "화면이 새로고침 전까지 안 갱신된다" 같은 버그가 콘솔에 아무 흔적도
        // 안 남기고 조용히 묻혀서 원인을 못 찾는다.
        return
      }
      onMessageRef.current(payload)
    })

    return () => subscription.unsubscribe()
  }, [destination, status])
}

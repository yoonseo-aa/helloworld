import { apiClient } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  ChatMessageListResponse,
  ChatRoomListResponse,
  ChatUnreadCountResponse,
  CreateChatRoomRequest,
  CreateChatRoomResponse,
} from './types'

/**
 * 채팅방 생성/재사용. 이미 나눈 방이 있으면(1:1만 해당) 새로 안 만들고 그 room_id를
 * 그대로 받는다. target_user_ids 원소가 1개면 DIRECT, 2개 이상이면 GROUP.
 */
export async function createChatRoom(targetUserIds: number[]) {
  const request: CreateChatRoomRequest = { target_user_ids: targetUserIds }
  const { data } = await apiClient.post<ApiResponse<CreateChatRoomResponse>>(
    '/api/chat/rooms',
    request,
  )
  return data.data
}

/**
 * 내가 참여 중인 채팅방 목록. keyword를 주면 참여자 이름으로 검색(1:1+단체방 모두 포함).
 * 커서 쿼리 파라미터는 before_last_message_id/before_room_id (snake_case) — 백엔드
 * ChatRoomController가 @RequestParam(name=...)로 명시 고정했다(fix(chat) 커밋,
 * develop 머지 완료). 전역 SNAKE_CASE 설정은 JSON 본문에만 적용되고 쿼리 파라미터는
 * 안 타서, 이름을 안 맞추면 스프링이 조용히 무시하고 커서 없는 1페이지만 계속
 * 돌려준다(에러도 400도 없음) — 그래서 여기서 명시적으로 snake_case로 보낸다.
 * size는 채팅방 목록 공통 규칙(20)으로 고정.
 */
export async function getChatRooms(params?: {
  keyword?: string
  beforeLastMessageId?: number
  beforeRoomId?: number
}) {
  const { data } = await apiClient.get<ApiResponse<ChatRoomListResponse>>('/api/chat/rooms', {
    params: {
      keyword: params?.keyword,
      before_last_message_id: params?.beforeLastMessageId,
      before_room_id: params?.beforeRoomId,
      size: 20,
    },
  })
  return data.data
}

/** 전체 안읽음 수 — 사이드바 DM 뱃지 초기값용. */
export async function getChatUnreadCount() {
  const { data } = await apiClient.get<ApiResponse<ChatUnreadCountResponse>>(
    '/api/chat/rooms/unread-count',
  )
  return data.data.unread_count
}

/**
 * 방의 메시지 조회. cursor 없으면 초기 로드, before만 과거 방향 페이징,
 * after만 갭 복구 — 동시 지정 안 함(타입에서부터 막아둔다).
 *
 * size를 명시하지 않으면 백엔드 기본값(50)이 나간다 — 무한 스크롤 페이지 크기
 * 공통 규칙(채팅 메시지 20)에 맞추려고 항상 20을 같이 보낸다.
 */
export async function getChatMessages(
  roomId: number,
  cursor?: { before: number } | { after: number },
) {
  const { data } = await apiClient.get<ApiResponse<ChatMessageListResponse>>(
    `/api/chat/rooms/${roomId}/messages`,
    { params: { ...cursor, size: 20 } },
  )
  return data.data
}

/**
 * 메시지 삭제(soft). 본인 메시지만 가능(403), 없는 메시지는 404, 재삭제는 멱등(200).
 * 화면 반영은 이 호출의 응답이 아니라 방 topic(`/topic/chat/rooms/{room_id}/deleted`)
 * 브로드캐스트로 한다 — sendMessage가 에코로 확정되는 것과 같은 패턴.
 */
export async function deleteChatMessage(roomId: number, messageId: number) {
  await apiClient.delete(`/api/chat/rooms/${roomId}/messages/${messageId}`)
}

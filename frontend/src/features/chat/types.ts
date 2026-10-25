/**
 * POST /api/chat/rooms 요청/응답.
 * 실제 백엔드(feature/be-chat, ChatRoomController)로 확인 완료한 진짜 계약 —
 * target_user_ids(원소 1개=DIRECT, 2개 이상=GROUP), 응답에 room_type 포함.
 * 지금 UI 흐름(1:1 DM)에서는 항상 원소 1개만 보낸다.
 */
export interface CreateChatRoomRequest {
  target_user_ids: number[]
}

export interface CreateChatRoomResponse {
  room_id: number
  room_type: 'DIRECT' | 'GROUP'
  is_new: boolean
}

/**
 * GET /api/chat/rooms 의 data.
 * 실제 백엔드(be-chat-read, ChatRoomController/ChatRoomListResponse)로 확인 완료한
 * 진짜 계약 — keyword(참여자 이름 검색) + 커서 페이징이 이번에 추가됐다.
 *
 * 커서가 두 값인 이유: 정렬 키가 (마지막 메시지 id, room_id)라서다. 마지막 메시지
 * id만으로는 값이 같은 방들(특히 메시지가 아직 없어 0으로 묶이는 방들)에서 경계가
 * 모호해 누락·중복이 생긴다. page_info의 두 값을 다음 요청에 그대로 넣는다.
 *
 * ⚠️ 쿼리 파라미터는 JSON 바디가 아니라서 Jackson 전역 snake_case 설정이 안 타고 Spring
 * @RequestParam 이름 그대로 나간다 — keyword/size는 원래 한 단어라 상관없지만, 커서
 * 두 개(before_last_message_id/before_room_id)는 백엔드가 @RequestParam(name=...)로
 * snake_case를 명시 고정해뒀다(fix(chat) 커밋). 이름을 안 맞추면 스프링이 조용히
 * 무시하고 커서 없는 1페이지만 반복해서 내려준다 — api.ts의 getChatRooms 참고.
 */
export interface ChatRoomCounterpart {
  user_id: number
  nickname: string | null
  profile_image_url: string | null
  /**
   * 이 사람이 현재까지 읽은 마지막 메시지 id (feature/be-chat-counterpart-read로 추가).
   * 실제 백엔드로 확인 완료 — 아직 하나도 안 읽었으면 이 필드 자체가 응답에서 빠진다
   * (전역 non_null 설정) — null이 아니라 undefined로 다뤄야 한다.
   */
  last_read_message_id?: number
}

export interface ChatRoomLastMessage {
  message_id: number
  sender_id: number
  /** 삭제된 메시지면 서버가 이미 대체 문구로 치환해서 내려준다(목록에서도 원문 안 보임). */
  content: string
  is_deleted: boolean
  sent_at: string
}

export interface ChatRoomSummary {
  room_id: number
  room_type: 'DIRECT' | 'GROUP'
  /** 그룹방 이름. DIRECT면 null — 프론트가 상대 닉네임을 대신 방 제목처럼 쓴다. */
  title: string | null
  /** 나를 제외한 참여자. DIRECT면 1명. */
  counterparts: ChatRoomCounterpart[]
  /** 아직 메시지가 없는 방이면 null. */
  last_message: ChatRoomLastMessage | null
  unread_count: number
  last_read_message_id: number | null
}

export interface ChatRoomListPageInfo {
  has_next: boolean
  /** 다음 요청의 beforeLastMessageId 쿼리 파라미터로 그대로 쓴다. */
  next_cursor_last_message_id: number | null
  /** 다음 요청의 beforeRoomId 쿼리 파라미터로 그대로 쓴다. */
  next_cursor_room_id: number | null
}

export interface ChatRoomListResponse {
  rooms: ChatRoomSummary[]
  page_info: ChatRoomListPageInfo
}

/** GET /api/chat/rooms/unread-count 의 data — 헤더·사이드바 뱃지용 전체 합계. */
export interface ChatUnreadCountResponse {
  unread_count: number
}

/**
 * GET /api/chat/rooms/{room_id}/messages 의 data.
 * 커서(before/after) 하나로 3가지 용도를 겸한다 — 파라미터 없음=입장 초기 로드,
 * before={message_id}=위로 스크롤(과거 방향), after={message_id}=재연결 갭 복구.
 * before·after 동시 지정 불가. message_id는 단조 증가 — 정렬·커서 기준.
 *
 * 실제 백엔드(feature/be-chat-message, ChatMessageController/ChatMessageResponse)로
 * 확인 완료한 진짜 계약 — 처음 msw로 흉내 냈던 has_more 대신 page_info 객체를 쓴다.
 * 이 API 호출 자체가 "읽음 처리" 부수효과를 가진다는 명세였지만, 백엔드엔 아직 그
 * 로직이 없다(순수 조회만) — 안읽음 카운트 리셋은 다음 단계에서 백엔드가 붙일 것.
 */
export interface ChatMessage {
  message_id: number
  room_id: number
  sender_id: number
  /** TEXT / IMAGE / VIDEO / SYSTEM. 지금 UI는 TEXT만 렌더링한다. */
  message_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'SYSTEM'
  /** 삭제된 메시지면 서버가 이미 "삭제된 메시지입니다."로 치환해서 내려준다(원문 아님). */
  content: string
  client_message_id: string | null
  is_deleted: boolean
  sent_at: string
}

export interface ChatMessagePageInfo {
  /** before 방향(과거)에 더 있는지 — 위로 무한 스크롤 종료 판단용. */
  has_previous: boolean
  /** after 방향(최신)에 더 있는지 — 갭 복구를 한 번 더 해야 하는지 판단용. */
  has_next: boolean
  /** 이 응답에서 가장 오래된 message_id. 다음 before 커서로 그대로 쓴다. 빈 응답이면 null. */
  oldest_message_id: number | null
  /** 이 응답에서 가장 최신 message_id. 다음 after 커서로 그대로 쓴다. 빈 응답이면 null. */
  newest_message_id: number | null
}

export interface ChatMessageListResponse {
  /** 시간 오름차순(과거 → 최신). */
  messages: ChatMessage[]
  page_info: ChatMessagePageInfo
}

/**
 * STOMP SUBSCRIBE /topic/chat/rooms/{room_id} 수신 프레임 (새 메시지).
 *
 * 실제 백엔드(ChatStompController)로 확인 완료 — 처음 설계 때 가정했던
 * `{ type: 'MESSAGE' | 'READ', ... }` 판별 유니언은 실제와 다르다. 서버는 REST 조회와
 * 완전히 같은 ChatMessageResponse(=ChatMessage) 객체를 그대로 방 topic에 뿌린다 —
 * type 필드 자체가 없다. 읽음·삭제 이벤트는 이 topic이 아니라 별도 topic
 * (RoomReadEventFrame·RoomDeletedEventFrame 참고)으로 분리돼 있어, 이 topic에
 * 오는 프레임은 항상 새 메시지 하나로 취급해도 된다(백엔드 be-chat-read MR로 확정).
 */
export type RoomTopicMessageFrame = ChatMessage

/**
 * STOMP SUBSCRIBE /topic/chat/rooms/{room_id}/read 수신 프레임 (읽음 이벤트).
 * 메시지 topic과 주소를 분리한 이유: 방 topic 프레임엔 type 판별 필드가 없어서,
 * 같은 주소로 보내면 프론트가 읽음 이벤트를 새 메시지로 착각해 대화창에 추가하게 된다.
 */
export interface RoomReadEventFrame {
  room_id: number
  user_id: number
  last_read_message_id: number
  read_at: string
}

/**
 * STOMP SUBSCRIBE /topic/chat/rooms/{room_id}/deleted 수신 프레임 (삭제 이벤트).
 * content는 서버가 이미 "삭제된 메시지입니다." 등으로 치환해서 내려준다 — 프론트가
 * 대체 문구를 직접 하드코딩하지 않는다(그러면 실시간 표시와 과거 조회 표시가 어긋난다).
 */
export interface RoomDeletedEventFrame {
  room_id: number
  message_id: number
  content: string
  is_deleted: boolean
  deleted_at: string
}

/**
 * 개인 큐(/user/queue/updates) 수신 프레임 — 실제 백엔드(feature/be-chat-personal-queue,
 * ChatRoomUpdateEvent)로 확인 완료. 방 topic은 그 방을 열어둔 사람만 받으므로, 다른
 * 화면에 있는 사람에게 "새 메시지 왔다"를 알려주는 용도(대화 목록 미리보기·뱃지 갱신).
 *
 * - type: 이 큐를 채팅·알림이 같이 쓰도록 되어 있어(개인 큐 하나 공용) 판별용으로 있다.
 *   지금은 CHAT_MESSAGE만 온다 — 다른 값이 오면 무시해야 한다(알림 기능이 나중에 붙임).
 * - unread_count: 이 이벤트를 받는 사람 기준, **이 방 하나의** 안읽음 수(절대값, 증가분
 *   아님). 다만 프론트는 이 값을 로그인 시점 seed와 합산할 방법이 없어(방별 초기 분포를
 *   모름) 실제로는 안 쓰고 "새 메시지 도착" 신호로만 쓴다 — 자세한 이유는
 *   main.tsx의 등록 코드 주석 참고.
 * - message.sender_id로 "내가 보낸 메시지의 에코"인지 구분한다 — 보낸 사람도 이 큐를
 *   받지만(여러 기기 목록 동기화 목적) 자기 메시지는 자기 안읽음에 안 잡힌다.
 */
export interface ChatRoomUpdateEvent {
  /** 지금은 항상 "CHAT_MESSAGE" — 다른 값(향후 알림)이 오면 무시해야 한다. */
  type: string
  room_id: number
  unread_count: number
  message: ChatMessage
}

/**
 * STOMP SEND /app/chat/rooms/{room_id}/messages 발행 payload.
 * 실제 백엔드(ChatMessageSendRequest)로 확인 완료 — content 최대 1000자(팀 합의값,
 * 백엔드도 @Size(max=1000)로 동일하게 적용됨). client_message_id는 클라이언트가
 * 만드는 멱등키(UUID 등, 최대 64자) — 형식은 자유라 features/chat/hooks.ts에서 임의로 만든다.
 */
export interface SendChatMessageRequest {
  client_message_id: string
  content: string
}

/**
 * 낙관적으로 렌더링 중인, 아직 서버 에코로 확정 안 된 메시지.
 * 'pending' = 에코 대기 중, 'failed' = 타임아웃(10초, 명세에 값 없어 임의 설정) 안에
 * 에코가 안 와서 실패 처리 — 재전송/삭제 버튼을 보여준다.
 */
export interface PendingChatMessage {
  client_message_id: string
  content: string
  sent_at: string
  status: 'pending' | 'failed'
}

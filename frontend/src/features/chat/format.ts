import type { ChatRoomSummary } from './types'

/** "방금 전 / n분 전 / n시간 전 / n일 전 / 날짜" — 대화 목록 마지막 메시지 시각용. */
export function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

/** 뱃지 99 초과는 "99+"로 프론트에서 처리 (명세 note). 대화 목록 항목·사이드바 뱃지 공용. */
export function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/** 메시지 버블 위 날짜 구분선 — "오늘"/"어제"/그 외 로케일 날짜. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '어제'
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

/** 메시지 버블의 절대 시각 라벨 — "오전/오후 h:mm". */
export function formatTimeLabel(iso: string): string {
  const date = new Date(iso)
  const hours = date.getHours()
  const period = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${period} ${hour12}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * DIRECT는 상대 닉네임, GROUP은 방 제목이 있으면 그걸, 없으면 참여자 닉네임을
 * "유저1, 유저2, 유저3"처럼 이어붙여서 방 이름처럼 쓴다.
 * 대화 목록과 채팅방 헤더 둘 다 같은 이름을 보여줘야 해서 공용으로 뺐다.
 */
export function roomDisplayName(room: ChatRoomSummary): string {
  if (room.room_type === 'GROUP') {
    if (room.title) return room.title
    return room.counterparts.map((c) => c.nickname ?? '닉네임 미설정').join(', ')
  }
  return room.counterparts[0]?.nickname ?? '닉네임 미설정'
}

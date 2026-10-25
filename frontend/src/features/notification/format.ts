import type { NotificationItem } from './types'

/**
 * 알림 표시용 변환.
 *
 * 서버는 type과 대상 id만 주고 문장은 주지 않는다(시안 목 데이터는 text_pre/target/post로
 * 쪼개져 있었다). 문구를 화면 컴포넌트에 흩뿌리면 종류가 늘 때마다 여러 곳을 고쳐야 해서
 * 여기 한곳에 모은다.
 */

/** 자정 기준 날짜 차이 — "어제 23:50"과 "오늘 00:10"이 같은 그룹이 되지 않게 시각이 아니라 날짜로 센다. */
function daysBetweenDates(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** 날짜 그룹 머리말 — 오늘 / 어제 / 이번 주 / 그 이전은 날짜. */
export function groupLabel(iso: string, now: Date = new Date()): string {
  const created = new Date(iso)
  const days = daysBetweenDates(created, now)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return '이번 주'
  if (created.getFullYear() === now.getFullYear()) {
    return `${created.getMonth() + 1}월 ${created.getDate()}일`
  }
  return `${created.getFullYear()}년 ${created.getMonth() + 1}월 ${created.getDate()}일`
}

/**
 * 알림 문장. actor 닉네임은 컴포넌트가 굵게 그리므로 여기선 나머지만 만든다.
 * target은 굵게, pre/post는 본문색으로 나간다(시안 구조 그대로).
 */
export function notificationText(type: NotificationItem['type']): {
  pre: string
  target: string
  post: string
} {
  switch (type) {
    case 'FOLLOW':
      return { pre: '님이 회원님을 ', target: '팔로우', post: '하기 시작했어요.' }
    case 'LIKE':
      return { pre: '님이 회원님의 ', target: '게시물', post: '을 좋아합니다.' }
    case 'COMMENT':
      return { pre: '님이 회원님의 ', target: '게시물', post: '에 댓글을 남겼어요.' }
  }
}

/**
 * 알림을 눌렀을 때 갈 곳.
 * FOLLOW는 대상 id가 없어 상대 프로필로, LIKE·COMMENT는 게시물로 간다.
 * 게시물 id가 비어 있으면(삭제된 글 등) 이동하지 않는다 — null을 돌려준다.
 */
export function notificationLink(item: NotificationItem): string | null {
  if (item.type === 'FOLLOW') return `/users/${item.actor_id}`
  return item.target_post_id ? `/posts/${item.target_post_id}` : null
}

/**
 * 프로필 이미지가 없으면 닉네임 첫 글자로 대체하는 원형 아바타.
 * feed 전용이었다가 search가 두 번째 사용처가 되어 승격했다 (CLAUDE.md 배치 규칙).
 * PostAuthor 등 어떤 타입이든 nickname·profile_image_url만 있으면 받는다 (구조적 타이핑).
 * 서버가 non_null 직렬화로 키를 아예 생략하는 경우(undefined)도 없음으로 처리한다 —
 * 닉네임 미설정 유저(가입 직후)는 nickname 키도 안 온다.
 */
export default function UserAvatar({
  user,
  className = 'h-9 w-9',
}: {
  user: { nickname?: string | null; profile_image_url?: string | null }
  className?: string
}) {
  if (user.profile_image_url) {
    return (
      <img
        src={user.profile_image_url}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    // 이니셜 폴백 — 시안 Avatar와 동일하게 중립색(뉴트럴 배경 + 헤어라인 테두리). 주황 틴트 금지.
    // 채움은 surface-sunken(시안 neutral-200)이다. surface-muted는 페이지 배경과 같은 색이라
    // 프로필 사진 없는 사람의 아바타가 배경에 묻혀 사라졌다.
    <span
      aria-hidden
      className={`${className} border-line bg-surface-sunken text-ink flex shrink-0 items-center justify-center rounded-full border text-sm font-semibold`}
    >
      {user.nickname?.trim().charAt(0) || '?'}
    </span>
  )
}

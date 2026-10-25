import { useTheme } from '@/hooks/useTheme'
import { Moon, Sun } from './icons'

/**
 * 테마 토글 — 시안(handoff AppShell)의 우하단 플로팅 버튼(52px 원형) 그대로.
 *
 * 셸(AppLayout) 안팎 양쪽에서 쓴다. 로그인·회원가입·비밀번호 찾기는 셸 밖 화면이라
 * 셸에만 두면 그 화면에서는 테마를 바꿀 방법이 없다 — 저장값이나 OS 설정을 따라 다크로
 * 뜨기는 하지만, 거기서 처음 들어온 사람은 바꿀 손잡이를 못 찾는다.
 *
 * z는 60(모바일 탭바)보다 위, 80(모달)보다 아래다 — 모달이 열리면 가려지는 게 맞다.
 */
export default function ThemeToggle({
  /**
   * 아래에 모바일 탭바가 깔리는 화면인가(셸 안). 탭바는 58px + 안전영역이라
   * 그만큼 띄워야 겹치지 않는다. 셸 밖 화면은 바닥에서 같은 여백만 둔다.
   */
  aboveTabBar = false,
}: {
  aboveTabBar?: boolean
}) {
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 테마로 전환' : '다크 테마로 전환'}
      aria-pressed={isDark}
      className={[
        'border-line-strong bg-surface text-ink/70 hover:text-ink fixed right-4 z-[70]',
        'flex h-[52px] w-[52px] items-center justify-center rounded-full border shadow-lg',
        'transition-transform active:scale-95 md:right-[22px] md:bottom-[22px]',
        aboveTabBar ? 'bottom-[76px]' : 'bottom-[22px]',
      ].join(' ')}
    >
      {isDark ? <Sun size={17} /> : <Moon size={20} />}
    </button>
  )
}

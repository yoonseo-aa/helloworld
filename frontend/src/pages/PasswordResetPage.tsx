import { Link, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/icons'
import ThemeToggle from '@/components/ThemeToggle'
import PasswordResetConfirmForm from '@/features/auth/components/PasswordResetConfirmForm'
import PasswordResetRequestForm from '@/features/auth/components/PasswordResetRequestForm'

/**
 * 비밀번호 찾기 — /password/reset (시안 Password Reset.dc.html 카드 레이아웃).
 *
 * <p><b>한 주소가 두 단계를 겸한다.</b> 메일 링크가 `/password/reset?token=...` 로 오기
 * 때문이다(백엔드 PasswordResetService가 그 주소로 링크를 만든다). 그래서 토큰이 붙어
 * 있으면 새 비밀번호 입력, 없으면 재설정 요청으로 갈린다. 주소를 둘로 나누면 메일 링크와
 * 화면 주소를 양쪽에서 맞춰야 하고, 한쪽만 바뀌면 링크가 조용히 깨진다.
 *
 * <p>로그인 화면과 달리 2단 브랜드 패널을 쓰지 않는다 — 시안이 이 화면만 단일 카드로
 * 그렸다. 할 일이 하나뿐이라 옆에 볼거리를 두지 않는 편이 맞다.
 *
 * <p>시안의 테마 전환 버튼(좌하단 고정)은 넣지 않았다. 로그인·회원가입 화면도 넣지 않았고,
 * 이 화면에만 있으면 오히려 어긋난다. 테마 토글을 붙이는 건 세 화면을 함께 다룰 일이다.
 */
export default function PasswordResetPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  return (
    <div className="bg-surface-muted flex min-h-dvh items-start justify-center md:items-center md:p-[34px_24px]">
      <div className="bg-surface border-line flex min-h-dvh w-full max-w-[480px] flex-col px-6 pt-[30px] pb-[26px] md:min-h-0 md:rounded-2xl md:border md:px-[42px] md:pt-[38px] md:pb-[30px] md:shadow-[0_10px_30px_rgba(22,24,32,0.07)]">
        <Link
          to="/login"
          className="border-line text-ink-muted hover:bg-surface-muted -ml-1 mb-[26px] inline-flex min-h-9 items-center gap-2 self-start rounded-full border pr-[13px] pl-2.5 text-[13px] transition-colors"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          로그인으로 돌아가기
        </Link>

        <div className="mb-[26px] flex items-center gap-[13px]">
          <BrandMark size={28} />
          <span className="text-ink text-[18px] font-bold">hello, world</span>
        </div>

        {token ? <PasswordResetConfirmForm token={token} /> : <PasswordResetRequestForm />}

        <div className="border-line text-ink-subtle mt-8 flex items-center justify-between border-t pt-[18px] text-[12.5px]">
          <span>© {new Date().getFullYear()} hello, world</span>
          <Link to="/signup" className="text-brand-hover hover:underline">
            계정 만들기
          </Link>
        </div>
      </div>
      {/* 셸 밖 화면이라 테마 토글이 따로 필요하다. */}
      <ThemeToggle />
    </div>
  )
}

import SignupForm from '@/features/auth/components/SignupForm'
import ThemeToggle from '@/components/ThemeToggle'

export default function SignupPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-ink text-2xl font-bold tracking-[-0.02em]">회원가입</h1>
      <SignupForm />
      {/* 셸 밖 화면이라 테마 토글이 따로 필요하다 — 여기서 처음 들어온 사람도 바꿀 수 있게. */}
      <ThemeToggle />
    </div>
  )
}

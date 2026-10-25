import BrandPanel from '@/features/auth/components/BrandPanel'
import ThemeToggle from '@/components/ThemeToggle'
import LoginForm from '@/features/auth/components/LoginForm'

/** 로그인 — 시안 Login.dc.html 2단 레이아웃 (좌 브랜드 패널 / 우 폼 카드) */
export default function LoginPage() {
  return (
    <div className="bg-surface-muted flex min-h-dvh items-stretch justify-center md:items-center md:p-8">
      <div className="bg-surface border-line flex w-full max-w-[1240px] flex-col overflow-hidden md:h-[calc(100dvh-4rem)] md:min-h-[560px] md:rounded-2xl md:border md:shadow-[0_10px_30px_rgba(22,24,32,0.07)]">
        {/*
          좌측 브랜드 패널이 넓어진 건 3D 큐브 때문이다. 큐브 실루엣은 회전하면 거의
          정사각이라 패널 **폭**이 곧 상한이고, 1.06fr(637px)에서는 큐브가 가로로 먼저
          잘렸다. 1.25fr이면 689px이 나와서 세로가 상한이 되고, 그때부터는 화면 높이에
          따라 자연히 결정된다. 우측은 551px — 패딩 112를 빼면 439px이고 폼이
          max-w-392px라 여유 있게 들어간다.
        */}
        <div className="grid min-h-0 flex-1 md:grid-cols-[1.25fr_1fr]">
          <div className="border-line order-2 flex min-h-0 flex-col overflow-hidden border-t px-6 pt-7 pb-8 md:order-1 md:border-t-0 md:px-14 md:py-10">
            <BrandPanel />
          </div>
          <div className="border-line order-1 flex min-h-0 flex-col justify-center overflow-hidden px-6 pt-12 pb-9 md:order-2 md:border-l md:px-14 md:py-10">
            <div className="mx-auto w-full max-w-[392px]">
              <h2 className="text-ink mb-2 text-[27px] font-bold tracking-[-0.02em] break-keep lg:text-[31px]">
                hello, world에 로그인
              </h2>
              <p className="text-ink-muted mb-7 text-[14.5px] break-keep">
                계정에 로그인하여 프로젝트 탐색과 빌딩을 계속하세요.
              </p>
              <LoginForm />
            </div>
          </div>
        </div>
        <div className="border-line text-ink-subtle flex flex-none items-center border-t px-6 py-4 text-[12.5px] md:justify-center">

        </div>
      </div>
      {/* 셸 밖 화면이라 테마 토글이 따로 필요하다 — 여기서 처음 들어온 사람도 바꿀 수 있게. */}
      <ThemeToggle />
    </div>
  )
}

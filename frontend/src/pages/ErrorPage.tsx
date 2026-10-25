import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

/**
 * 라우터 최상위 에러 경계 (router.tsx의 errorElement).
 *
 * 하위 라우트에서 렌더 중 던져진 예외를 여기서 받는다. 이게 없으면 React Router의
 * 기본 화면(흰 배경 + 영문 스택 트레이스)이 사용자에게 그대로 노출된다.
 *
 * 한계: 이벤트 핸들러나 비동기 콜백에서 던져진 에러는 렌더 사이클 밖이라 여기까지
 * 오지 않는다. API 실패 같은 것들은 지금처럼 TanStack Query의 isError로 화면마다 처리한다.
 */
export default function ErrorPage() {
  const error = useRouteError()

  // 라우터가 만든 응답 에러(404 등)와 코드에서 던진 Error를 나눠 원인 문구를 고른다.
  let detail: string
  if (isRouteErrorResponse(error)) {
    detail = `${error.status} ${error.statusText}`
  } else if (error instanceof Error) {
    detail = error.message
  } else {
    detail = String(error)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-ink-subtle font-mono text-sm">ERROR</p>
      <h1 className="text-ink text-xl font-bold">문제가 발생했습니다</h1>
      <p className="text-ink-muted text-sm">
        화면을 그리는 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.
      </p>

      {/* 원인은 개발 중에만 보여준다 — 사용자에게 내부 사정을 그대로 노출하지 않는다. */}
      {import.meta.env.DEV && (
        <pre className="bg-surface-muted text-ink-subtle mt-1 max-w-full overflow-x-auto rounded-lg p-3 text-left font-mono text-xs">
          {detail}
        </pre>
      )}

      {/*
        Link가 아니라 하드 내비게이션을 쓴다. 이미 상태가 깨져서 여기까지 온 상황이라
        SPA 이동으로는 같은 에러가 다시 날 수 있다. 통째로 다시 띄워 메모리 상태를 초기화한다.
      */}
      <button
        type="button"
        onClick={() => window.location.assign('/')}
        className="bg-brand hover:bg-brand-hover mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        홈으로
      </button>
    </div>
  )
}

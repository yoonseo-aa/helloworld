import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-ink-subtle font-mono text-sm">404</p>
      <h1 className="text-ink text-xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-ink-muted text-sm">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <Link
        to="/"
        className="bg-brand hover:bg-brand-hover mt-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        홈으로
      </Link>
    </div>
  )
}

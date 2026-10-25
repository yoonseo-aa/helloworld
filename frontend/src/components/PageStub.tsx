/**
 * 와이어프레임 전 임시 자리표시자.
 * 각 화면이 어떤 API를 부르게 되는지 적어두고, 라우팅이 실제로 도는지 눈으로 확인하는 용도.
 * 화면 구현이 시작되면 해당 페이지에서 이 컴포넌트를 지운다.
 */
export default function PageStub({
  title,
  route,
  apis = [],
  note,
}: {
  title: string
  route: string
  apis?: string[]
  note?: string
}) {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <p className="text-ink-subtle font-mono text-xs tracking-wider uppercase">
        {route}
      </p>
      <h1 className="text-ink mt-2 text-2xl font-bold tracking-tight">{title}</h1>

      {apis.length > 0 && (
        <div className="border-line bg-surface mt-6 rounded-lg border p-4">
          <p className="text-ink-subtle text-xs font-semibold tracking-wide uppercase">
            호출할 API
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {apis.map((api) => (
              <li key={api} className="text-ink-muted font-mono text-sm">
                {api}
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && <p className="text-ink-muted mt-4 text-sm">{note}</p>}
    </div>
  )
}

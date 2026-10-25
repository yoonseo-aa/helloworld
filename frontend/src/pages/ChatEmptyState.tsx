/** /chat 인덱스 라우트 — 방을 아직 고르지 않았을 때 우측 패널에 뜨는 안내 (시안 문구). */
export default function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="text-ink/[.3]"
      >
        <path d="M8 12h.01" />
        <path d="M12 12h.01" />
        <path d="M16 12h.01" />
        <path d="M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.1A7.6 7.6 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
      </svg>
      <p className="text-ink/[.55] text-[13.5px]">대화를 불러오면 여기에 표시돼요.</p>
    </div>
  )
}

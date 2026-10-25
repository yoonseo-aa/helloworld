import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/**
 * 게시글 본문·AI 요약용 Markdown 렌더러.
 *
 * 타이포그래피 플러그인 없이 요소별 클래스만 입힌다 — 상세 패널(폭 380px)에 맞는
 * 작은 스케일이라 heading도 한 단계씩 낮춰(h1→text-base) 그린다.
 * react-markdown은 기본적으로 raw HTML을 렌더하지 않으므로 XSS 걱정 없이 원문을 넘긴다.
 */
const components: Components = {
  h1: ({ node: _node, ...props }) => (
    <h3 {...props} className="text-ink mt-4 mb-1.5 text-base font-bold first:mt-0" />
  ),
  h2: ({ node: _node, ...props }) => (
    <h4 {...props} className="text-ink mt-4 mb-1.5 text-[15px] font-bold first:mt-0" />
  ),
  h3: ({ node: _node, ...props }) => (
    <h5 {...props} className="text-ink mt-3 mb-1 text-sm font-bold first:mt-0" />
  ),
  p: ({ node: _node, ...props }) => (
    <p {...props} className="text-ink mb-3 text-sm leading-relaxed break-words last:mb-0" />
  ),
  a: ({ node: _node, ...props }) => (
    // 모달 안에서 본문 링크로 이동하면 작업 맥락이 날아간다 — 항상 새 탭.
    <a {...props} target="_blank" rel="noreferrer" className="text-brand underline" />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul {...props} className="text-ink mb-3 list-disc pl-5 text-sm leading-relaxed" />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol {...props} className="text-ink mb-3 list-decimal pl-5 text-sm leading-relaxed" />
  ),
  li: ({ node: _node, ...props }) => <li {...props} className="mb-1" />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      {...props}
      className="border-line text-ink-muted mb-3 border-l-2 pl-3 text-sm"
    />
  ),
  // 인라인 코드 기준으로 스타일링하고, 블록(pre 안)은 pre 쪽에서 배경·패딩을 되돌린다.
  code: ({ node: _node, ...props }) => (
    <code
      {...props}
      className="bg-surface-muted rounded px-1 py-0.5 font-mono text-[13px]"
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      {...props}
      className="bg-surface-muted mb-3 overflow-x-auto rounded-lg p-3 text-[13px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0"
    />
  ),
  img: ({ node: _node, ...props }) => (
    // alt는 원문 Markdown에 적힌 값이 그대로 온다.
    <img {...props} loading="lazy" className="mb-3 max-w-full rounded-lg" />
  ),
  hr: ({ node: _node, ...props }) => <hr {...props} className="border-line my-4" />,
}

export default function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}

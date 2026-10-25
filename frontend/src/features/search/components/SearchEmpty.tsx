import { Search } from '@/components/icons'

/**
 * 결과 없음 상태 — 시안(front handoff SearchResults.tsx state='empty') 그대로.
 * ALL 뷰와 카테고리 탭 뷰가 같이 쓴다.
 */
export default function SearchEmpty({ keyword }: { keyword: string }) {
  return (
    <div className="flex flex-col items-center px-5 pt-16 pb-10 text-center">
      <span className="border-line-strong bg-surface text-ink-subtle flex h-16 w-16 items-center justify-center rounded-full border">
        <Search size={26} strokeWidth={1.6} />
      </span>
      <h2 className="mt-[22px] text-[19px] font-bold">검색 결과가 없어요</h2>
      <p className="text-ink-muted mt-[9px] max-w-[340px] text-sm leading-[1.7] break-keep">
        '{keyword}'와 일치하는 결과를 찾지 못했어요. 철자를 확인하거나 더 짧은
        키워드로 검색해 보세요.
      </p>
    </div>
  )
}

import { useGithubRepos } from '../hooks'
import type { GithubRepo } from '../types'

/**
 * GitHub 저장소 선택 패널. 작성 모달의 "저장소 선택" 버튼으로 열린다.
 * 목록 API는 백엔드 미구현이라 msw 목으로 동작한다.
 */
export default function GithubRepoPicker({
  onSelect,
}: {
  onSelect: (repo: GithubRepo) => void
}) {
  const { data: repos, isPending, isError } = useGithubRepos()

  if (isPending) {
    return (
      <p className="border-line text-ink-subtle rounded-lg border p-3 text-sm">
        저장소 목록을 불러오는 중...
      </p>
    )
  }

  if (isError) {
    return (
      <p className="border-line text-danger rounded-lg border p-3 text-sm">
        저장소 목록을 불러오지 못했습니다.
      </p>
    )
  }

  if (repos.length === 0) {
    return (
      <p className="border-line text-ink-subtle rounded-lg border p-3 text-sm">
        연동된 저장소가 없습니다.
      </p>
    )
  }

  return (
    // 목록 높이는 작성 모달 좌측 컬럼에 들어가는 크기로 맞춘다 — 더 길면 컬럼이 넘쳐
    // 목록을 펼칠 때마다 좌측에 스크롤이 생긴다.
    <ul className="border-line max-h-48 overflow-y-auto [scrollbar-gutter:stable] rounded-lg border">
      {repos.map((repo) => (
        <li key={repo.repo_id}>
          <button
            type="button"
            onClick={() => onSelect(repo)}
            className="hover:bg-surface-muted flex w-full flex-col gap-0.5 px-3 py-2 text-left"
          >
            <span className="text-ink text-sm font-medium">{repo.name}</span>
            <span className="text-ink-subtle text-xs">
              {[repo.language, repo.description].filter(Boolean).join(' · ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

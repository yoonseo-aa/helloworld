import { Outlet } from 'react-router-dom'
import FeedList from '@/features/feed/components/FeedList'
import { useGithubConnectResult } from '@/features/profile/useGithubConnectResult'

/**
 * 메인 피드 — 조립만 (구현은 features/feed/FeedList).
 * 검색 진입은 AppLayout 스티키 헤더의 공통 검색바가 담당한다 (시안 이식, 2026-08-05).
 *
 * <Outlet />은 게시글 상세 모달(/posts/:postId) 자리다. 피드가 마운트된 채로(스크롤 유지)
 * 모달만 얹히고, 뒤로가기로 닫힌다 — FollowListModal과 같은 자식 라우트 패턴.
 *
 * GitHub 연동 결과(?github=...)는 INVALID_STATE일 때 프로필이 아니라 여기(홈)로도
 * 돌아올 수 있어 useGithubConnectResult()를 붙인다 (useGithubConnectResult.ts 참고).
 */
export default function FeedPage() {
  useGithubConnectResult()

  return (
    <>
      <FeedList />
      <Outlet />
    </>
  )
}

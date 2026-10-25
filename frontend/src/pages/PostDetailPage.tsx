import { useParams } from 'react-router-dom'
import PostDetailModal from '@/features/feed/components/PostDetailModal'
import { toRouteId } from '@/hooks/routeId'

/**
 * 게시글 상세 (좌: 라이브 데모 체험 / 우: 본문·AI 요약·댓글).
 *
 * FeedPage의 자식 라우트 — 어디서 진입하든 피드 위 모달로 열린다 (라우터 주석 참고).
 * postId가 숫자가 아니면 NaN이 그대로 내려가고, 모달이 "찾을 수 없음" 에러 UI를 그린다.
 */
export default function PostDetailPage() {
  const { postId } = useParams()
  return <PostDetailModal postId={toRouteId(postId)} />
}

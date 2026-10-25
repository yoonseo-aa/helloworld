import { apiClient } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  AiSummaryResponse,
  AnalyzeProjectRequest,
  AnalyzeProjectResponse,
  CommentCreateRequest,
  CommentCreateResponse,
  FeedResponse,
  GithubReposResponse,
  LikedPostsResponse,
  PostCommentsResponse,
  PostCreateRequest,
  PostCreateResponse,
  PostDetailResponse,
  PostLikesResponse,
  PostType,
  ToggleLikeResponse,
} from './types'

/**
 * 게시물 생성. 인증 필수 엔드포인트라 skipAuthRefresh를 붙이지 않는다 —
 * 여기서 오는 401은 진짜 토큰 만료이므로 인터셉터의 자동 재발급이 정상 동작해야 한다.
 */
export async function createPost(request: PostCreateRequest) {
  const { data } = await apiClient.post<ApiResponse<PostCreateResponse>>(
    '/api/posts',
    request,
  )
  return data.data
}

/**
 * 피드 목록 — 팔로잉 기반, post_id 내림차순 커서 페이지네이션 (백엔드 feature/be-post-read 실구현).
 * post_type 필터는 목에만 있고 **실서버는 무시한다** — 카테고리 탭에 필요해 백엔드와 협의 대상
 * (experiment/fe-post-read 연동 실험에서 확인된 계약 공백).
 */
export async function getPosts(params: {
  /** 불투명 토큰(문자열) — 직전 응답의 page_info.next_cursor를 그대로 넣는다 (types.ts 주석 참고). */
  cursor?: string
  size: number
  post_type?: PostType
}) {
  const { data } = await apiClient.get<ApiResponse<FeedResponse>>('/api/posts', {
    params,
  })
  return data.data
}

// ── GitHub 연동·AI 분석·댓글·AI 요약은 백엔드 미구현 — msw 목(src/mocks/handlers.ts) 대상 임시 계약 ──

/** 연동된 GitHub 계정의 저장소 목록. */
export async function getGithubRepos() {
  const { data } =
    await apiClient.get<ApiResponse<GithubReposResponse>>('/api/github/repos')
  return data.data.repos
}

/**
 * GitHub 저장소 분석 → 기술 스택 + 본문 초안(readme).
 *
 * timeout을 따로 주는 이유: GitHub 왕복 2회 + LLM 호출이라 **5~15초** 걸린다.
 * 공통 클라이언트의 기본 타임아웃이 이보다 짧으면 정상 요청이 취소된다.
 *
 * signal을 받는 이유: 저장소를 연달아 바꾸면 요청이 쌓이는데 **호출 한 번마다 과금된다.**
 * 호출부가 이전 요청을 끊을 수 있어야 한다.
 */
export async function analyzeProject(
  request: AnalyzeProjectRequest,
  signal?: AbortSignal,
) {
  const { data } = await apiClient.post<ApiResponse<AnalyzeProjectResponse>>(
    '/api/posts/analyze',
    request,
    { timeout: 60_000, signal },
  )
  return data.data
}

/**
 * 내가 좋아요한 게시물 목록 — 커서(like_id) 기반, 좋아요 누른 최신순.
 * 이 파일의 다른 함수들과 달리 백엔드 구현이 이미 있다 (features/feed/types.ts 참고).
 */
export async function getLikedPosts(
  userId: number,
  params: { cursor?: number; size: number },
) {
  const { data } = await apiClient.get<ApiResponse<LikedPostsResponse>>(
    `/api/users/${userId}/liked-posts`,
    { params },
  )
  return data.data
}

/** 게시글 상세 — 전문·링크·AI 요약 + 조회수 증가 (백엔드 feature/be-post-read 실구현). */
export async function getPostDetail(postId: number) {
  const { data } = await apiClient.get<ApiResponse<PostDetailResponse>>(
    `/api/posts/${postId}`,
  )
  return data.data
}

/** 댓글 작성 — 생성된 댓글의 id만 돌려준다(전체 객체 아님). 나머지는 낙관적 값을 그대로 쓴다. */
export async function createComment(postId: number, request: CommentCreateRequest) {
  const { data } = await apiClient.post<ApiResponse<CommentCreateResponse>>(
    `/api/posts/${postId}/comments`,
    request,
  )
  return data.data
}

/** AI 요약 생성 — 서버가 생성·저장 후 요약문을 돌려준다. 이미 ai_summary가 있으면 부르지 않는다. */
export async function generateAiSummary(postId: number) {
  const { data } = await apiClient.post<ApiResponse<AiSummaryResponse>>(
    `/api/posts/${postId}/ai-summary`,
  )
  return data.data
}

/** 좋아요 토글 — 서버가 토글 후 최종 상태를 돌려준다 (누름/해제 판단은 서버 몫). */
export async function toggleLike(postId: number) {
  const { data } = await apiClient.post<ApiResponse<ToggleLikeResponse>>(
    `/api/posts/${postId}/like`,
  )
  return data.data
}

/** 댓글 좋아요 토글 — 게시물 좋아요와 응답 모양이 같다({is_liked, like_count}). */
export async function toggleCommentLike(commentId: number) {
  const { data } = await apiClient.post<ApiResponse<ToggleLikeResponse>>(
    `/api/comments/${commentId}/like`,
  )
  return data.data
}

/** 좋아요 누른 사용자 목록 — 커서 페이지네이션. */
export async function getPostLikes(
  postId: number,
  params: { cursor?: number; size: number },
) {
  const { data } = await apiClient.get<ApiResponse<PostLikesResponse>>(
    `/api/posts/${postId}/likes`,
    { params },
  )
  return data.data
}

/** 댓글 목록 — created_at 오름차순(작성순, 오래된 것부터), page 기반 오프셋 페이지네이션. */
export async function getPostComments(
  postId: number,
  params: { page: number; size: number },
) {
  const { data } = await apiClient.get<ApiResponse<PostCommentsResponse>>(
    `/api/posts/${postId}/comments`,
    { params },
  )
  return data.data
}

/** 댓글 삭제 — 본인 댓글만(서버가 재검증). 성공 응답의 data는 null. */
export async function deleteComment(commentId: number) {
  await apiClient.delete<ApiResponse<null>>(`/api/comments/${commentId}`)
}

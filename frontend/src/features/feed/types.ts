/** 서버 posts.post_type 값. */
export type PostType = 'PROJECT' | 'CARD_NEWS'

/**
 * POST /api/posts 요청 바디.
 *
 * 서버 검증은 post_type·content 필수 확인뿐이고 타입별 필드 구분도 하지 않는다.
 * PROJECT/CARD_NEWS에 맞는 필드만 담아 보내는 책임은 프론트에 있다.
 */
export interface PostCreateRequest {
  post_type: PostType
  /** Markdown 본문. */
  content: string
  thumbnail_url?: string
  github_url?: string
  /** 서버에서는 posts.project_link 컬럼에 저장된다 — iframe 라이브 데모용. */
  deploy_url?: string
  /** AI 또는 사용자가 작성한 프로젝트 요약. 서버에서는 posts.ai_summary에 저장된다. */
  summary?: string
  /** 중복 값을 보내면 서버 uk_post_tags UNIQUE 제약으로 500이 난다 — 보내기 전에 제거해야 한다. */
  tech_stacks?: string[]
  /** 카드뉴스 이미지. 배열 순서가 그대로 display_order(0부터)로 저장된다. */
  image_urls?: string[]
}

export interface PostCreateResponse {
  post_id: number
}

/**
 * ── 아래는 임시 계약 (백엔드 미구현, src/mocks/handlers.ts 목 기준) ──
 * 저장소 목록·프로젝트 분석·파일 업로드 API는 백엔드에 아직 없다.
 * 실제 구현될 때 URL·필드를 팀과 합의해 목 핸들러와 여기를 함께 고친다.
 */

export interface GithubRepo {
  repo_id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  updated_at: string
}

export interface GithubReposResponse {
  repos: GithubRepo[]
}

export interface AnalyzeProjectRequest {
  github_url: string
}

/** 저장소 분석 응답 — README 본문과 기술 스택을 돌려준다. README는 작성 폼의 본문에 채운다. */
export interface AnalyzeProjectResponse {
  readme: string
  tech_stacks: string[]
}

// UploadFileResponse는 feed 전용이 아니게 되어 @/api/types로 옮겼다 (profile도 씀).

// ── 피드 목록 (GET /api/posts) — 백엔드 feature/be-post-read 실구현 기준 ──
// 서버는 jackson non_null 직렬화라 값이 null인 필드는 키 자체가 생략된다.
// 프론트에서 생략될 수 있는 필드는 `?: T | null`로 적는다 (목은 null, 실서버는 키 생략).

export interface PostAuthor {
  user_id: number
  /**
   * users.nickname은 nullable이고 회원가입은 이메일·비밀번호만 받는다 — 닉네임을 아직
   * 설정하지 않은 작성자는 키가 생략된다(non_null). 실험(2026-08-05)에서 실제로 확인.
   */
  nickname?: string | null
  /** 프로필 이미지가 없으면 실서버에서는 키가 생략된다(non_null). */
  profile_image_url?: string | null
  /** 상세 조회에서만 서버가 채운다 — 피드 목록에서는 항상 생략. */
  is_following?: boolean
}

/**
 * 피드 카드 1장 (서버 FeedItemResponse). content는 Markdown 원문이라 카드에서는 발췌한다.
 *
 * 처음 실구현엔 post_type·thumbnail_url·tech_stacks가 없어 카드 UI를 잠정 제거했었는데,
 * 요청이 반영돼(2026-08-05, BE e012b8a) 셋 다 추가되며 복원했다. 대신 image_urls가
 * 빠졌다 — 피드는 대표컷 1장(thumbnail_url)만 주고, 전체 이미지는 상세에서 준다.
 */
export interface FeedItem {
  post_id: number
  post_type: PostType
  author: PostAuthor
  content: string
  /** 대표컷. posts.thumbnail_url, 없으면 서버가 첫 IMAGE 미디어로 폴백(카드뉴스). 둘 다 없으면 키 생략. */
  thumbnail_url?: string | null
  /** post_tags→tags 태그명 목록. 서버가 빈 배열을 보장한다. */
  tech_stacks: string[]
  like_count: number
  comment_count: number
  is_liked: boolean
  created_at: string
}

/**
 * 커서 페이지네이션 — 마지막 페이지면 next_cursor 키가 생략된다(non_null).
 *
 * ⚠️ 메인 피드의 커서만 **불투명 base64 토큰(문자열)**이다. 팔로우한 유저의 최근 30분 글을
 * 상단에 고정하면서 정렬 키가 (is_pinned, created_at, post_id) 3개가 됐고, 숫자 하나로는
 * 다음 위치를 집을 수 없어 서버가 셋을 묶어 인코딩해 내려준다
 * (백엔드 feature/be-feed-pinned-follow의 FeedCursor).
 *
 * **해석하지 말고 다음 요청 cursor로 그대로 돌려보낼 것.** 값을 쪼개거나 숫자로 비교하는
 * 순간 깨진다(서버는 못 읽는 커서에 400 COMMON_INVALID_PARAM을 준다).
 *
 * 좋아요 목록·좋아요 누른 사람 목록 등 다른 커서는 여전히 숫자다(아래 LikedPostsResponse
 * 등) — 이 타입만 문자열이고, 공용으로 묶지 않는다.
 */
export interface FeedPageInfo {
  next_cursor?: string | null
  has_next: boolean
}

/** 피드는 배열 키가 feeds, 페이징이 page_info 중첩 — CursorResponse(items)와 다른 전용 포맷. */
export interface FeedResponse {
  feeds: FeedItem[]
  page_info: FeedPageInfo
}

/**
 * 옛 임시 계약의 피드 카드 — 이제 앱 코드는 안 쓰고 **msw 목 시드(src/mocks)만** 쓴다.
 * 검색·유저 게시물 그리드 목이 아직 이 모양을 시드로 삼아 남겨 둔다. 해당 도메인
 * 백엔드가 확정되면 시드 구조와 함께 정리한다.
 */
export interface PostSummary {
  post_id: number
  post_type: PostType
  author: PostAuthor
  content: string
  thumbnail_url: string | null
  /** CARD_NEWS 이미지 — display_order 순. PROJECT는 빈 배열. */
  image_urls: string[]
  tech_stacks: string[]
  like_count: number
  comment_count: number
  is_liked: boolean
  created_at: string
}

// ── 게시글 상세 (GET /api/posts/{post_id}) — 백엔드 feature/be-post-read 실구현 기준 ──

/**
 * 서버 PostDetailResponse. content는 Markdown 전문 그대로 렌더한다 (피드는 발췌, 상세는 전문).
 * 컬럼 매핑: deploy_url = posts.project_link, summary = posts.ai_summary.
 * tech_stacks·image_urls는 서버가 빈 배열을 보장하고, author.is_following도 항상 채워 온다.
 */
export interface PostDetailResponse {
  post_id: number
  post_type: PostType
  author: PostAuthor
  thumbnail_url?: string | null
  content: string
  github_url?: string | null
  /** 좌측 체험 영역 iframe에 넣는 배포 URL. 깃허브 주소가 아니라 아무 배포 사이트나 된다. */
  deploy_url?: string | null
  /** AI 요약(posts.ai_summary). 없으면 키 생략 — AI 요약 버튼이 생성 API를 부른다. */
  summary?: string | null
  tech_stacks: string[]
  image_urls: string[]
  like_count: number
  comment_count: number
  /** 상세 조회마다 서버가 1 올려서 준다. */
  view_count: number
  is_liked: boolean
  created_at: string
}

/** POST /api/posts/{post_id}/ai-summary — 요약을 생성해 저장하고 돌려준다. */
export interface AiSummaryResponse {
  summary: string
}

// ── 좋아요·댓글 (백엔드 미구현, 위와 같은 임시 계약) ──

/** POST /api/posts/{post_id}/like — 토글 후 서버 기준 최종 상태를 돌려준다. */
export interface ToggleLikeResponse {
  is_liked: boolean
  like_count: number
}

/** GET /api/posts/{post_id}/likes — 좋아요 누른 사용자 목록. */
export interface PostLikesResponse {
  users: PostAuthor[]
  next_cursor: number | null
  has_next: boolean
}

// ── 내가 좋아요한 게시물 (GET /api/users/{user_id}/liked-posts) ──
// 위의 임시 계약들과 달리 **백엔드 구현이 이미 있다** (UserLikedPostController, 2026-08-03
// develop 머지). 아래 타입은 그 실물(LikedPostResponse + CursorResponse)을 그대로 옮긴 것.

/**
 * 좋아요한 게시물 1개 — post_likes 기준으로 posts·users를 JOIN한 결과.
 * 피드(PostSummary)와 달리 작성자가 중첩 객체(author)가 아니라 평평한 필드로 온다.
 */
export interface LikedPostItem {
  /** 커서로 쓰는 값 (post_likes.like_id). 목록은 이 값 내림차순 = 좋아요 누른 최신순. */
  like_id: number
  post_id: number
  post_type: PostType
  content: string
  /** 카드뉴스는 첫 이미지가 대표컷으로 들어온다 (서버 JOIN 기준). */
  thumbnail_url: string | null
  like_count: number
  comment_count: number
  author_id: number
  author_nickname: string
  author_profile_image_url: string | null
  /** 내가 좋아요를 누른 시각 (post_likes.created_at). */
  liked_at: string
  post_created_at: string
}

/** 백엔드 공통 CursorResponse<T> 포맷 — 피드의 FeedResponse(posts)와 달리 items 키다. */
export interface LikedPostsResponse {
  items: LikedPostItem[]
  next_cursor: number | null
  has_next: boolean
}

export interface PostComment {
  comment_id: number
  author: PostAuthor
  content: string
  created_at: string
  updated_at: string
  /** 로그인 사용자가 작성자 본인인지 — 서버가 계산해 내려주는 UI 힌트(권한 판정은 서버가 다시 함). */
  is_mine: boolean
  like_count: number
  is_liked: boolean
}

/**
 * GET /api/posts/{post_id}/comments?page=&size= — 작성순(created_at 오름차순, 오래된 것부터).
 * 백엔드 공통 오프셋 페이징 포맷(PageResponse<T>) — 커서가 아니라 page 번호를 쓴다.
 */
export interface PostCommentsResponse {
  items: PostComment[]
  page: number
  size: number
  total_count: number
  total_pages: number
}

export interface CommentCreateRequest {
  content: string
}

/** POST /api/posts/{post_id}/comments 응답 — 생성된 댓글의 id만 온다(전체 객체 아님). */
export interface CommentCreateResponse {
  comment_id: number
}

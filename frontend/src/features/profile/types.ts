/**
 * GET /api/users/{user_id} 의 data.
 *
 * nickname은 ERD상 NOT NULL이지만, 가입 직후에는 아직 값이 없다
 * (UserService.register — 닉네임은 별도 "프로필 생성" 단계에서 설정).
 * 백엔드가 default-property-inclusion: non_null이라 null 필드는 응답에서
 * 아예 빠지므로, 프론트에서는 필드가 없을 수 있다고 보고 optional로 둔다.
 *
 * is_following은 실제로는 이 응답에 없다(be-follow 실제 백엔드로 확인 완료) — 대신
 * GET /api/users/{user_id}/follow(팔로우 상태 단건 조회)로 따로 받는다.
 * FollowButton이 그 조회를 담당한다(components/FollowButton.tsx 참고).
 */
export interface ProfileResponse {
  user_id: number
  email: string | null
  nickname: string | null
  profile_image_url: string | null
  introduce: string | null
}

/**
 * POST /api/profiles 요청.
 * 명세상 모든 필드가 선택이지만, 이번 라운드는 닉네임을 프론트에서 필수로 강제한다.
 * interest_tag_ids는 태그 조회 API가 아직 없어 이번에도 제외.
 * profile_image_url은 문자열 URL만 받는다 — 실제 업로드(POST /api/files)로 먼저
 * 받아온 URL을 여기 담아서 보낸다 (features/profile/components/ProfileSettingsForm 참고).
 */
export interface CreateProfileRequest {
  nickname?: string
  introduce?: string
  profile_image_url?: string
  /**
   * 관심 태그(기술스택·포지션·도메인) 마스터 ID 목록. GET /api/tags로 후보를 받는다.
   *
   * ⚠️ 저장만 되고 되읽을 수 없다 — ProfileResponse에 태그 필드가 없어서
   * 편집 화면이 기존 선택을 복원하지 못한다. 그래서 이 값을 보낼 때는 "이번에 고른 것"만
   * 담기게 되고, 과거 선택은 덮어써진다. 백엔드에 조회 응답 확장을 요청해 둔 상태다
   * (docs/api-request-profile-tags.md).
   */
  interest_tag_ids?: number[]
}

/**
 * GET /api/users/{user_id}/badges 항목 (백엔드 be-badge, BadgeResponse.java).
 *
 * 4축(게시·받은 좋아요·댓글·GitHub) × 3티어 = 12종이고, 응답에는 **축별 최고 등급 하나씩**
 * 달성분만 담겨 최대 4개다. 활동이 없으면 빈 배열이며 오류가 아니다.
 *
 * 예전엔 프론트가 이 계산을 직접 했다 — 게시글 목록을 훑으며 좋아요를 합산하느라 N+1이 났고,
 * 골드 기준까지만 세고 멈춰서 수치가 하한값이었다. 지금은 서버가 집계 한 번으로 정확히 준다.
 */
export interface BadgeResponse {
  /** BadgeCode enum 이름(POST_GOLD 등). **아이콘을 고르는 키다** — label은 바뀔 수 있다. */
  code: string
  /** 표시명("기록 장인"). 툴팁 제목. */
  label: string
  /** 축 식별자. 분기는 label이 아니라 이 값으로 한다. */
  axis: 'POST' | 'LIKE' | 'COMMENT' | 'GITHUB'
  /** 축 표시명("게시", "받은 좋아요" …). */
  axis_label: string
  tier: 'BRONZE' | 'SILVER' | 'GOLD'
  /** 이 등급 달성에 필요한 값. */
  threshold: number
  /** 현재 수치. "42편 · 골드 기준 30편" 진행 표시에 쓴다. */
  current_value: number
}

/** GET /api/tags 항목 */
export interface TagResponse {
  tag_id: number
  tag_type: 'TECH' | 'POSITION' | 'DOMAIN'
  tag_name: string
}

export interface CreateProfileResponse {
  user_id: number
}

/**
 * POST/DELETE /api/users/{user_id}/follow 의 data.
 * 팔로우/언팔로우 둘 다 "그 상태로 확정"하는 멱등 토글이라, 현재 상태를 물어보는 게 아니다.
 */
export interface FollowToggleResponse {
  is_following: boolean
  follower_count: number
}

/** GET /api/users/{user_id}/followers/count 의 data. */
export interface FollowerCountResponse {
  follower_count: number
}

/** GET /api/users/{user_id}/following/count 의 data. */
export interface FollowingCountResponse {
  following_count: number
}

/**
 * GET /api/users/{user_id}/followers 또는 /following 목록의 항목 하나.
 * nickname은 ProfileResponse와 같은 이유로 null일 수 있다 — 프로필 설정을 안 마친
 * 계정도 누군가를 팔로우/팔로우당할 수 있어서, 목록에 그런 계정이 섞여 나올 수 있다.
 */
// 주의: 실제 be-follow 브랜치의 FollowUserResponse.java엔 아직 introduce가 없다
// (명세 PRF-004엔 "한줄소개(1줄 말줄임)" 노출이 있음) — 백엔드에 반영 필요, 팀에 전달할 것.
export interface FollowUser {
  user_id: number
  nickname: string | null
  introduce: string | null
  profile_image_url: string | null
  /** 뷰어(로그인 사용자) 기준 팔로우 여부. */
  is_following: boolean
}

/**
 * GET /api/users/{user_id}/followers, /following 의 data.
 * next_cursor는 마지막 항목의 팔로우 시각(epoch ms) — 다음 페이지 요청 시 cursor로 그대로 보낸다.
 */
export interface FollowListResponse {
  content: FollowUser[]
  next_cursor: number | null
  has_next: boolean
}

/**
 * GET /api/users/{user_id}/posts 목록의 항목 하나 (프로필 하단 3열 그리드).
 * 백엔드 실구현(UserPostController, develop 0b2372a) 기준 — 커서(post_id) 페이징,
 * size 기본 15. thumbnail_url은 카드뉴스면 첫 이미지로 폴백돼 내려온다.
 */
export interface ProfilePost {
  post_id: number
  /** 썸네일도 이미지도 없는 글은 키가 생략된다(non_null) — 그리드가 빈 칸 플레이스홀더를 그린다. */
  thumbnail_url?: string | null
  post_type: 'PROJECT' | 'CARD_NEWS'
}

/** 백엔드 공통 CursorResponse<T> — 배열 키는 items. 마지막 페이지면 next_cursor 키가 생략된다(non_null). */
export interface ProfilePostListResponse {
  items: ProfilePost[]
  next_cursor?: number | null
  has_next: boolean
}

/**
 * GET /api/users/{user_id}/github 의 data — 실제 백엔드(feature/be-github,
 * GithubContributionResponse.java)로 확인 완료한 진짜 계약.
 *
 * 예전엔 "GET /api/github(JWT로 나만 조회) 명세서 문서 기준, 이 API만 camelCase"로
 * 적혀 있었는데 실제 구현은 다른 도메인들과 똑같이 snake_case이고, 애초에
 * 공개 조회용으로 요청했던 /api/users/{user_id}/github 경로로 이미 만들어져 있었다
 * (developerType/activitySummary 필드는 실제 응답에 없다 — 삭제).
 *
 * 미연동이면 404 GITHUB_NOT_CONNECTED — api.ts의 getUserGithub가 이 경우 null로 바꿔 돌려준다.
 */
export interface GithubTechStack {
  name: string
  percentage: number
}

export interface GithubBadge {
  tier: 'BRONZE' | 'SILVER' | 'GOLD'
  label: string
  color: string
  min_active_days: number
}

/** count는 공개+비공개 합계. */
export interface GithubContributionDay {
  date: string
  count: number
}

export interface UserGithubResponse {
  github_login: string
  /** 한 번도 동기화된 적 없으면 키가 생략된다(non_null). */
  last_synced_at?: string
  /** 조회 구간(포함). from은 항상 일요일. */
  from: string
  to: string
  total_commits: number
  public_commits: number
  private_commits: number
  active_days: number
  /** 등급이 없으면(NONE) 키가 생략된다(non_null). */
  badge?: GithubBadge
  tech_stacks: GithubTechStack[]
  /** from~to 전 구간이 빠짐없이 채워져 온다(커밋 없는 날은 count 0). */
  contributions: GithubContributionDay[]
}

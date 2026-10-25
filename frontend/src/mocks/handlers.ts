import { delay, http, HttpResponse, passthrough } from 'msw'
import type {
  CommentCreateRequest,
  PostAuthor,
  PostCreateRequest,
  PostSummary,
} from '@/features/feed/types'
// 잔디 날짜 창을 프론트와 "같은 함수"로 만든다 — 목이 날짜를 따로 계산하면 하루만 어긋나도
// mapToWindow가 매칭에 실패해 초원/잔디가 전부 0으로 그려진다.
import { window53 } from '@/features/profile/contributions'
import type { GithubBadge, UserGithubResponse } from '@/features/profile/types'
import { getFile, putFile } from './fileStore'

/**
 * msw 핸들러 — 개발/테스트 전용, 프로덕션 번들 제외 (main.tsx의 DEV 가드).
 *
 * 여기 있는 API들은 백엔드에 아직 없다. 계약(URL·필드)은 시퀀스 다이어그램 기준의
 * **임시안**이며, 백엔드가 실제로 구현할 때 팀과 합의해 이 파일과
 * features/feed/types.ts·api.ts를 함께 고쳐야 한다.
 * 응답은 실서버와 동일하게 ApiResponse 래퍼 + snake_case (CLAUDE.md 규칙 3·7).
 */

// 업로드된 목 파일은 IndexedDB에 둔다 (./fileStore) — 이유는 그 파일 주석 참고.

/**
 * sessionStorage 복원 헬퍼. 목 상태(프로필·팔로우 관계·작성한 글)를 새로고침 너머로 잇는다.
 * 탭을 닫으면(세션 종료) 사라지는 건 그대로 둔다 — 그때는 다시 처음부터 시작.
 *
 * 파일 맨 위에 두는 이유: 아래 여러 저장소가 모듈 로드 시점에 이걸 부른다. 함수 선언이라
 * 호이스팅되긴 하지만, 선언 위치가 사용처보다 아래면 나중에 화살표 함수로 바꾸는 순간
 * TDZ 에러로 msw가 통째로 안 뜬다. 순서에 기대지 않게 정의를 앞으로 옮겨 뒀다.
 *
 * 주의: JSON.parse 결과를 캐스팅할 뿐 런타임 검증은 하지 않는다. 저장한 모양이
 * 바뀔 수 있는 값이라면 호출하는 쪽에서 형태를 걸러야 한다 (createdPosts 참고).
 */
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// ── 피드 시드 데이터 ─────────────────────────────
// 이미지는 외부 placeholder(picsum)를 쓴다 — 목 전용 데이터라 앱 코드와 무관하고,
// 오프라인에서는 이미지만 안 뜰 뿐 피드는 동작한다.

const MOCK_USERS = [
  { user_id: 101, nickname: '김싸피', profile_image_url: 'https://picsum.photos/seed/u101/80' },
  { user_id: 102, nickname: 'devHana', profile_image_url: null },
  { user_id: 103, nickname: '백엔드꿈나무', profile_image_url: 'https://picsum.photos/seed/u103/80' },
  { user_id: 104, nickname: 'jun.dev', profile_image_url: null },
]

/**
 * 요청자를 알 수 없을 때(Authorization 헤더 없음) 쓰는 자리표시자 작성자.
 * 평소에는 mockAuthorOf()가 JWT의 user_id + 저장된 프로필로 진짜 작성자를 만든다.
 */
const MOCK_ME = { user_id: 999, nickname: '나', profile_image_url: null }

const SEED_POSTS: PostSummary[] = [
  {
    post_id: 28,
    post_type: 'PROJECT',
    author: MOCK_USERS[3],
    content:
      '# Block Battle\n\n웹 PvP 블록 퍼즐 게임입니다. 접속하면 바로 상대와 매칭되고 키보드로 조작해요. 왼쪽 데모에서 바로 한 판 해보세요!',
    thumbnail_url: 'https://picsum.photos/seed/post28/600/338',
    image_urls: [],
    tech_stacks: ['JavaScript', 'Canvas', 'Node.js'],
    like_count: 17,
    comment_count: 4,
    is_liked: false,
    created_at: '2026-08-01T20:15:00Z',
  },
  {
    post_id: 27,
    post_type: 'PROJECT',
    author: MOCK_USERS[2],
    content:
      '# Tetris Battle Arena\n\n실시간 대전 테트리스를 만들고 있습니다. 배포 사이트가 iframe 삽입을 막아 두어서, 미리보기가 안 뜨면 새 창에서 열어 주세요.',
    thumbnail_url: null,
    image_urls: [],
    tech_stacks: ['TypeScript', 'WebSocket'],
    like_count: 11,
    comment_count: 2,
    is_liked: false,
    created_at: '2026-07-31T13:40:00Z',
  },
  {
    post_id: 26,
    post_type: 'PROJECT',
    author: MOCK_USERS[0],
    content:
      '# Hello World\n\n개발자 SNS를 만들고 있습니다. 피드·채팅·알림까지 실시간으로 붙일 예정이에요. React 19 + Spring Boot 3 조합입니다.',
    thumbnail_url: 'https://picsum.photos/seed/post26/600/338',
    image_urls: [],
    tech_stacks: ['React', 'TypeScript', 'Spring Boot', 'MySQL', 'Redis'],
    like_count: 24,
    comment_count: 6,
    is_liked: true,
    created_at: '2026-07-29T09:30:00Z',
  },
  {
    post_id: 25,
    post_type: 'CARD_NEWS',
    author: MOCK_USERS[1],
    content:
      'HTTP 상태 코드, 이것만 알면 됩니다. 401과 403의 차이, 301과 302의 차이를 카드 3장으로 정리했어요.',
    thumbnail_url: null,
    image_urls: [
      'https://picsum.photos/seed/post25a/600/600',
      'https://picsum.photos/seed/post25b/600/600',
      'https://picsum.photos/seed/post25c/600/600',
    ],
    tech_stacks: ['HTTP', '네트워크'],
    like_count: 41,
    comment_count: 9,
    is_liked: false,
    created_at: '2026-07-28T21:10:00Z',
  },
  {
    post_id: 24,
    post_type: 'PROJECT',
    author: MOCK_USERS[2],
    content:
      '# Chat Server PoC\n\nSTOMP 기반 실시간 채팅 서버 개념 검증을 끝냈습니다. CONNECT → SUBSCRIBE → SEND 흐름과 heart-beat 처리까지 확인했어요.',
    thumbnail_url: null,
    image_urls: [],
    tech_stacks: ['Java', 'Spring Boot', 'WebSocket', 'STOMP'],
    like_count: 13,
    comment_count: 3,
    is_liked: false,
    created_at: '2026-07-28T08:45:00Z',
  },
  {
    post_id: 23,
    post_type: 'CARD_NEWS',
    author: MOCK_USERS[3],
    content: 'TanStack Query v5에서 달라진 점을 정리했습니다. onSuccess 콜백 제거가 핵심이에요.',
    thumbnail_url: null,
    image_urls: [
      'https://picsum.photos/seed/post23a/600/600',
      'https://picsum.photos/seed/post23b/600/600',
    ],
    tech_stacks: ['React', 'TanStack Query'],
    like_count: 18,
    comment_count: 5,
    is_liked: false,
    created_at: '2026-07-27T19:20:00Z',
  },
  {
    post_id: 22,
    post_type: 'PROJECT',
    author: MOCK_USERS[1],
    content:
      '# Portfolio\n\nNext.js로 포트폴리오 사이트를 새로 만들었습니다. Vercel 배포까지 완료. 라이브 데모 링크 달아뒀어요.',
    thumbnail_url: 'https://picsum.photos/seed/post22/600/338',
    image_urls: [],
    tech_stacks: ['Next.js', 'TypeScript', 'Tailwind CSS'],
    like_count: 32,
    comment_count: 7,
    is_liked: true,
    created_at: '2026-07-26T14:00:00Z',
  },
  {
    post_id: 21,
    post_type: 'PROJECT',
    author: MOCK_USERS[0],
    content:
      '알고리즘 스터디 저장소를 공개합니다. 백준·프로그래머스 풀이를 주 2회 올리고 있어요. 같이 하실 분 댓글 주세요!',
    thumbnail_url: null,
    image_urls: [],
    tech_stacks: ['Python'],
    like_count: 9,
    comment_count: 11,
    is_liked: false,
    created_at: '2026-07-25T22:30:00Z',
  },
]

const FILLER_TEMPLATES: Pick<PostSummary, 'post_type' | 'content' | 'tech_stacks'>[] = [
  {
    post_type: 'PROJECT',
    content: '사이드 프로젝트 진행 중입니다. 리팩터링하면서 배운 점을 정리해 올릴 예정이에요.',
    tech_stacks: ['React', 'TypeScript'],
  },
  {
    post_type: 'CARD_NEWS',
    content: '자주 쓰는 git 명령어를 카드로 정리했습니다. rebase와 merge의 차이도 다뤄요.',
    tech_stacks: ['Git'],
  },
  {
    post_type: 'PROJECT',
    content: 'Spring Boot로 만든 토이 프로젝트입니다. 계층형 아키텍처 연습용. 피드백 환영합니다!',
    tech_stacks: ['Java', 'Spring Boot'],
  },
]

/** 무한 스크롤 확인용 필러 — 결정적으로 생성한다 (항상 같은 목록). post_id 1~18. */
const FILLER_POSTS: PostSummary[] = Array.from({ length: 18 }, (_, index) => {
  const id = index + 1
  const template = FILLER_TEMPLATES[id % FILLER_TEMPLATES.length]
  return {
    ...template,
    post_id: id,
    author: MOCK_USERS[id % MOCK_USERS.length],
    thumbnail_url:
      template.post_type === 'PROJECT' && id % 2 === 0
        ? `https://picsum.photos/seed/post${id}/600/338`
        : null,
    image_urls:
      template.post_type === 'CARD_NEWS'
        ? [
            `https://picsum.photos/seed/post${id}a/600/600`,
            `https://picsum.photos/seed/post${id}b/600/600`,
          ]
        : [],
    like_count: (id * 7) % 40,
    comment_count: (id * 3) % 12,
    is_liked: id % 5 === 0,
    created_at: `2026-07-${String(id).padStart(2, '0')}T12:00:00Z`,
  }
})

// 사용자가 목 모드에서 쓴 글만 sessionStorage에 백업한다 — 시드(SEED/FILLER)는 코드에서
// 다시 만들어지므로 저장할 필요가 없고, 본문은 텍스트라 용량 부담도 없다. 첨부 이미지는
// 문자열이 아니라서 여기 못 담고 IndexedDB(./fileStore)가 따로 맡는다.
const CREATED_POSTS_STORAGE_KEY = 'msw:mockCreatedPosts'

/**
 * 복원한 항목이 지금의 PostSummary 모양인지 확인한다.
 *
 * loadJSON은 JSON.parse 결과를 캐스팅만 하므로 타입이 주는 보장이 없다. 개발 중에
 * PostSummary가 바뀌면(백엔드 계약이 확정되면 반드시 바뀐다) sessionStorage에는 옛 모양이
 * 그대로 남아 있고, 그 상태로 새로고침하면 mockPostsFor의 post.image_urls[0]이나
 * post.author.user_id에서 TypeError가 나 프로필 화면이 통째로 죽는다.
 * 여기서 거르면 옛 항목만 조용히 버려지고 앱은 계속 돈다.
 */
function isRestorablePost(value: unknown): value is PostSummary {
  if (typeof value !== 'object' || value === null) return false
  const post = value as Partial<PostSummary>
  return (
    typeof post.post_id === 'number' &&
    (post.post_type === 'PROJECT' || post.post_type === 'CARD_NEWS') &&
    typeof post.content === 'string' &&
    Array.isArray(post.image_urls) &&
    Array.isArray(post.tech_stacks) &&
    typeof post.author === 'object' &&
    post.author !== null &&
    typeof post.author.user_id === 'number'
  )
}

const restoredPosts = loadJSON<unknown>(CREATED_POSTS_STORAGE_KEY, [])
// 배열이 아닌 값이 들어있을 수도 있다(직접 수정·다른 버전이 쓴 값) — 그 경우도 통째로 버린다.
const createdPosts: PostSummary[] = Array.isArray(restoredPosts)
  ? restoredPosts.filter(isRestorablePost)
  : []

function saveCreatedPosts() {
  sessionStorage.setItem(CREATED_POSTS_STORAGE_KEY, JSON.stringify(createdPosts))
}

/** 피드 목 저장소 — 게시물 생성 목이 여기에 추가해서, 방금 게시한 글이 피드 최상단에 보인다. */
const mockPosts: PostSummary[] = [...createdPosts, ...SEED_POSTS, ...FILLER_POSTS]

// 복원한 글보다 큰 값에서 이어간다 — 1000으로 되돌리면 새로고침 후 쓴 글이
// 복원된 글과 post_id가 겹쳐서 피드 커서·React key가 꼬인다.
let nextPostId = createdPosts.reduce((max, post) => Math.max(max, post.post_id), 1000)

// ── 좋아요·댓글 시드 생성기 — post_id 기반 결정적 생성 (새로고침해도 같은 목록) ──

const LIKER_NICKNAMES = [
  '코딩하는곰',
  '새벽커밋러',
  '타입좋아',
  '리액트덕후',
  '머지컨플릭트',
  '논블로킹',
  '캐시미스',
  '오프바이원',
]

/** post_id·순번으로 좋아요 누른 가짜 사용자를 만든다. user_id는 시드 사용자와 안 겹치는 대역. */
function likerOf(postId: number, index: number): PostAuthor {
  const base = LIKER_NICKNAMES[(postId + index) % LIKER_NICKNAMES.length]
  return {
    user_id: 10_000 + postId * 100 + index,
    // 목록이 닉네임 풀보다 길면 순번을 붙여 중복을 피한다.
    nickname: index >= LIKER_NICKNAMES.length ? `${base}${index}` : base,
    profile_image_url:
      (postId + index) % 3 === 0
        ? `https://picsum.photos/seed/liker${postId}-${index}/80`
        : null,
  }
}

const COMMENT_TEMPLATES = [
  '우와 대단해요! 저도 해보고 싶네요.',
  '기술 스택 선정 이유가 궁금합니다.',
  '배포 링크 들어가봤는데 잘 되네요 👍',
  '저장소 구경하고 갑니다. 스타 눌렀어요.',
  'README 정리가 깔끔하네요.',
  '다음 편도 기대할게요!',
]

/**
 * 목 저장용 최소 형태 — is_mine/is_liked는 뷰어(요청자)에 따라 달라지므로 저장해 두지 않고
 * 응답을 만들 때(GET/POST 핸들러) 그때그때 채운다.
 */
interface SeedComment {
  comment_id: number
  author: PostAuthor
  content: string
  created_at: string
}

/** comment_count만큼 결정적으로 생성해 캐시한다 — 페이지네이션이 요청 간에 흔들리지 않게. */
const commentsCache = new Map<number, SeedComment[]>()

/** 댓글 좋아요 — comment_id -> 좋아요 누른 viewer_id 집합. like_count는 이 집합의 크기다. */
const commentLikedBy = new Map<number, Set<number>>()

function commentsOf(post: PostSummary): SeedComment[] {
  const cached = commentsCache.get(post.post_id)
  if (cached) return cached
  const baseTime = new Date(post.created_at).getTime()
  const comments = Array.from({ length: post.comment_count }, (_, index) => ({
    // 게시물별 대역을 나눠 comment_id가 겹치지 않게 한다.
    comment_id: post.post_id * 1000 + index + 1,
    author: MOCK_USERS[(post.post_id + index) % MOCK_USERS.length],
    content: COMMENT_TEMPLATES[(post.post_id + index) % COMMENT_TEMPLATES.length],
    // 게시 시각 이후 1시간 간격 — 순번이 클수록(=comment_id가 클수록) 최신(작성순 오름차순).
    created_at: new Date(baseTime + (index + 1) * 3_600_000).toISOString(),
  }))
  commentsCache.set(post.post_id, comments)
  return comments
}

// ── 게시글 상세 부가정보 — github_url·deploy_url·ai_summary ──
// PostSummary(피드 카드)에는 없는 상세 전용 컬럼(posts.github_url/project_link/ai_summary).
// 시드는 SEED_EXTRAS 상수로, 목 모드에서 작성·생성된 값은 sessionStorage 백업으로 관리한다
// (createdPosts처럼 새로고침 너머로 이어야 "내가 쓴 글의 데모가 사라지는" 혼란이 없다).

interface PostExtras {
  github_url: string | null
  deploy_url: string | null
  ai_summary: string | null
}

// deploy_url은 iframe 차단 헤더(X-Frame-Options/frame-ancestors)가 없는 실제 사이트로
// 골랐다 (2026-08-03 응답 헤더 검증) — 라이브 데모를 목에서 실제로 조작해 볼 수 있다.
// 예외로 27번만 일부러 차단 사이트(tetr.io)다 — "iframe을 거부하는 배포 사이트"가
// 어떻게 보이는지 확인하는 용도. ai_summary가 이미 있는 글(26)/없는 글(나머지)을 섞었고,
// "데모 없음" 폴백 상태는 extras가 아예 없는 필러 프로젝트 글(#3·#6 등)이 커버한다.
// 외부 사이트 사정(차단 헤더 추가·도메인 소멸)으로 깨지면 여기 URL만 갈아끼우면 된다.
const SEED_EXTRAS: Record<number, Partial<PostExtras>> = {
  28: {
    github_url: 'https://github.com/jundev/block-battle',
    // 비공식 블록퍼즐 게임 — 임베드 허용이라 바로 플레이된다.
    deploy_url: 'https://tetrio.io',
  },
  27: {
    github_url: 'https://github.com/ssafy/tetris-battle-arena',
    // X-Frame-Options: SAMEORIGIN — 프레임 안에 브라우저의 거부 화면이 뜬다 (의도된 예시).
    deploy_url: 'https://tetr.io',
  },
  26: {
    github_url: 'https://github.com/ssafy/hello-world',
    // React로 만든 TodoMVC — 시드 글 본문(React 프로젝트)과 설정이 맞는다.
    deploy_url: 'https://todomvc.com/examples/react/dist/',
    ai_summary:
      '- **한 줄 소개** — 개발자들이 프로젝트를 공유하고 실시간으로 소통하는 SNS입니다.\n- **핵심 기능** — 피드·게시글, 1:1 채팅, 실시간 알림, GitHub 연동 프로필.\n- **기술 스택** — React 19와 Spring Boot 3를 축으로 MySQL·Redis를 씁니다.',
  },
  24: {
    github_url: 'https://github.com/ssafy/chat-server-poc',
    // 실시간 협업 그림판 — 실시간 채팅 PoC 글과 결이 맞는다.
    deploy_url: 'https://excalidraw.com',
  },
  22: {
    github_url: 'https://github.com/devhana/portfolio',
    // 육각형 테트리스 게임 — 바로 플레이되는 "체험" 확인용.
    deploy_url: 'https://hextris.io',
  },
  21: {
    github_url: 'https://github.com/ssafy/algo-study',
    // 문서형 프로젝트 예시 — 스터디 저장소 글과 결이 맞는다.
    deploy_url: 'https://ko.vitejs.dev',
  },
}

const POST_EXTRAS_STORAGE_KEY = 'msw:mockPostExtras'

const savedExtras = new Map<number, PostExtras>(
  loadJSON<[number, PostExtras][]>(POST_EXTRAS_STORAGE_KEY, []),
)

function saveExtras() {
  sessionStorage.setItem(
    POST_EXTRAS_STORAGE_KEY,
    JSON.stringify([...savedExtras.entries()]),
  )
}

/**
 * 저장분(작성·요약 생성)과 시드를 **필드별로 병합**한다.
 *
 * 링크(github/deploy)는 시드가 우선 — AI 요약 핸들러가 저장할 때 그 시점의 extras를
 * 통째로 스냅샷하기 때문에, "요약 한 번 생성 → 그 뒤 코드에서 시드 URL 교체 → 옛
 * 스냅샷이 새 시드를 영영 가림" 함정이 실제로 있었다. 시드 글의 링크는 코드가 정본이다.
 * ai_summary는 반대로 저장분 우선 — 생성 결과가 시드 초기값보다 최신이다.
 * 목 모드에서 작성한 글은 시드 항목이 없으므로 자연히 저장분이 그대로 쓰인다.
 */
function extrasOf(postId: number): PostExtras {
  const saved = savedExtras.get(postId)
  const seed = SEED_EXTRAS[postId]
  return {
    github_url: seed?.github_url ?? saved?.github_url ?? null,
    deploy_url: seed?.deploy_url ?? saved?.deploy_url ?? null,
    ai_summary: saved?.ai_summary ?? seed?.ai_summary ?? null,
  }
}

// 상세 조회수 — 실서버처럼 조회할 때마다 1씩 오른다. 세션 내 메모리로 충분해 저장은 안 한다.
const viewCounts = new Map<number, number>()

/** AI 요약 목 생성 — 본문 첫 문장과 기술 스택으로 그럴듯한 마크다운 요약을 만든다. */
function mockSummaryOf(post: PostSummary): string {
  const firstLine =
    post.content
      .replace(/^#{1,6}\s+.*$/gm, '') // 헤딩 제거
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? '내용이 없는 게시물입니다.'
  const stacks = post.tech_stacks.length > 0 ? post.tech_stacks.join(', ') : '명시 안 됨'
  return [
    `- **한 줄 소개** — ${firstLine}`,
    `- **기술 스택** — ${stacks}`,
    `- **읽는 포인트** — ${post.post_type === 'PROJECT' ? '라이브 데모와 저장소 링크에서 구현 디테일을 확인할 수 있어요.' : '카드 이미지를 순서대로 넘기며 핵심만 훑을 수 있어요.'}`,
  ].join('\n')
}

// ── github: 연동 계정의 저장소 목록 ─────────────────────────────

const MOCK_REPOS = [
  {
    repo_id: 1,
    name: 'hello-world-frontend',
    full_name: 'devplay/hello-world-frontend',
    html_url: 'https://github.com/devplay/hello-world-frontend',
    description: '개발자 SNS Hello World 프론트엔드',
    language: 'TypeScript',
    updated_at: '2026-07-27T09:12:00Z',
  },
  {
    repo_id: 2,
    name: 'hello-world-backend',
    full_name: 'devplay/hello-world-backend',
    html_url: 'https://github.com/devplay/hello-world-backend',
    description: '개발자 SNS Hello World 백엔드 API 서버',
    language: 'Java',
    updated_at: '2026-07-26T18:40:00Z',
  },
  {
    repo_id: 3,
    name: 'portfolio-site',
    full_name: 'devplay/portfolio-site',
    html_url: 'https://github.com/devplay/portfolio-site',
    description: '개인 포트폴리오 · Vercel 배포',
    language: 'TypeScript',
    updated_at: '2026-07-20T11:03:00Z',
  },
  {
    repo_id: 4,
    name: 'algo-study',
    full_name: 'devplay/algo-study',
    html_url: 'https://github.com/devplay/algo-study',
    description: '알고리즘 스터디 풀이 모음',
    language: 'Python',
    updated_at: '2026-07-18T21:55:00Z',
  },
  {
    repo_id: 5,
    name: 'chat-server-poc',
    full_name: 'devplay/chat-server-poc',
    html_url: 'https://github.com/devplay/chat-server-poc',
    description: 'STOMP 채팅 서버 PoC',
    language: 'Java',
    updated_at: '2026-07-10T08:20:00Z',
  },
  {
    repo_id: 6,
    name: 'dotfiles',
    full_name: 'devplay/dotfiles',
    html_url: 'https://github.com/devplay/dotfiles',
    description: null,
    language: 'Shell',
    updated_at: '2026-06-30T14:00:00Z',
  },
]

// ── post 분석: 저장소 이름 → README·기술 스택 (결정적 응답) ─────────

const DEFAULT_ANALYSIS = {
  readme: '# 프로젝트\n\nGitHub 저장소 분석으로 가져온 README입니다. 내용을 자유롭게 수정하세요.',
  tech_stacks: ['React', 'TypeScript'],
}

const ANALYSIS_BY_REPO: Record<string, typeof DEFAULT_ANALYSIS> = {
  'hello-world-frontend': {
    readme: [
      '# Hello World Frontend',
      '',
      '개발자 SNS **Hello World**의 프론트엔드입니다.',
      '',
      '## 기술 스택',
      '- React 19 + TypeScript + Vite',
      '- TanStack Query (서버 상태) / Zustand (클라이언트 상태)',
      '',
      '## 실행',
      '```bash',
      'npm install && npm run dev',
      '```',
    ].join('\n'),
    tech_stacks: ['React', 'TypeScript', 'Vite', 'TanStack Query', 'Zustand'],
  },
  'hello-world-backend': {
    readme: [
      '# Hello World Backend',
      '',
      '개발자 SNS **Hello World**의 API 서버입니다.',
      '',
      '## 기술 스택',
      '- Spring Boot 3 / MyBatis / MySQL',
      '- Redis (좋아요·팔로우 카운트 정본)',
    ].join('\n'),
    tech_stacks: ['Java', 'Spring Boot', 'MyBatis', 'MySQL', 'Redis'],
  },
  'portfolio-site': {
    readme: [
      '# Portfolio',
      '',
      'Next.js로 만든 개인 포트폴리오 사이트. Vercel로 배포합니다.',
      '',
      '## 배포',
      'https://portfolio.example.com',
    ].join('\n'),
    tech_stacks: ['Next.js', 'TypeScript', 'Tailwind CSS'],
  },
  'algo-study': {
    readme: '# Algo Study\n\n자료구조·알고리즘 문제 풀이 저장소입니다.\n\n- 백준 / 프로그래머스\n- 주 2회 스터디',
    tech_stacks: ['Python'],
  },
  'chat-server-poc': {
    readme: '# Chat Server PoC\n\nSTOMP 프로토콜 기반 실시간 채팅 서버 개념 검증.\n\n## 프로토콜\n- CONNECT → SUBSCRIBE → SEND 흐름 검증\n- heart-beat 10s',
    tech_stacks: ['Java', 'Spring Boot', 'WebSocket', 'STOMP'],
  },
}

// ── profile: 프로필 설정 저장·조회 (백엔드 미구현 — msw 목 대상 임시 계약) ──
// GET /api/users/:userId는 이 목이 저장한 프로필만 흉내내고, 그 외(실제 가입된
// 다른 사용자)는 passthrough로 실서버에 그대로 넘긴다 — 안 그러면 팔로우 목록 등에서
// 보이는 진짜 사용자들까지 이 목이 가짜로 답해버린다.
interface MockProfile {
  user_id: number
  nickname: string | null
  introduce: string | null
  profile_image_url: string | null
}

// 프로필·팔로우 관계도 sessionStorage에 백업한다 (loadJSON은 파일 상단 참고).
// 새로고침(주소창 직접 입력 포함)해도 안 날아가게 하려는 것 — 페이지 이동마다
// 9001~9003처럼 링크가 없는 테스트 유저에게 가려면 주소창 입력이 불가피해서
// 순수 메모리 저장(Map)만으로는 "여러 명 팔로우 → 목록 확인"이 안 됐다.
// 탭을 닫으면(세션 종료) 사라지는 건 유지 — 그때는 다시 처음부터 시작.
const PROFILES_STORAGE_KEY = 'msw:mockProfiles'
const FOLLOW_GRAPH_STORAGE_KEY = 'msw:mockFollowGraph'

const mockProfiles = new Map<number, MockProfile>(
  loadJSON<[number, MockProfile][]>(PROFILES_STORAGE_KEY, []),
)

function saveProfiles() {
  sessionStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([...mockProfiles.entries()]))
}

/**
 * 피드 작성자(MOCK_USERS 101~104)의 프로필.
 *
 * 이게 없으면 GET /api/users/:userId가 passthrough()로 실서버에 넘어가고, 목 로그인은
 * 가짜 JWT를 들고 있어서 401이 난다 — 즉 **피드에서 작성자를 클릭해 프로필로 들어가는
 * 흐름 자체가 목 모드에서 깨져 있었다.** 게시글(mockPostsFor)·좋아요·잔디는 이미 이 ID로
 * 답하고 있었는데 정작 프로필만 빠져 있어서, 업적 배지도 GitHub 축 하나만 떴다.
 * 한줄소개는 프로필 화면에서 그 자리가 비어 보이지 않게 넣어둔 표시용 문구다.
 */
const MOCK_AUTHOR_INTRODUCES: Record<number, string> = {
  101: '싸피 11기 · 프론트엔드를 파고 있습니다.',
  102: 'React와 TypeScript로 먹고삽니다. 사이드프로젝트 좋아해요.',
  103: 'Spring Boot 공부 중입니다. 피드백 환영합니다!',
  104: '게임 서버에 관심 많은 백엔드 개발자.',
}
for (const author of MOCK_USERS) {
  if (mockProfiles.has(author.user_id)) continue
  mockProfiles.set(author.user_id, {
    user_id: author.user_id,
    nickname: author.nickname,
    introduce: MOCK_AUTHOR_INTRODUCES[author.user_id] ?? null,
    profile_image_url: author.profile_image_url,
  })
}

// 팔로우 목록 UI(한줄소개·아바타 클릭·빈 상태 등) 확인용 목 전용 유저.
// 실제 가입 계정(권영민 등)과 안 섞이게 9000번대로 분리 — 이 ID로 팔로우하면
// GET /api/users/:userId도 이 목이 답해서(위 mockProfiles), 실서버로 안 새어나간다.
// sessionStorage에 이미 저장된 값이 있으면(직접 수정해봤다면) 그걸 우선한다.
if (!mockProfiles.has(9001)) {
  mockProfiles.set(9001, {
    user_id: 9001,
    nickname: '테스트유저1',
    introduce: '프론트엔드 개발자입니다. 잘 부탁드려요!',
    profile_image_url: null,
  })
}
if (!mockProfiles.has(9002)) {
  mockProfiles.set(9002, {
    user_id: 9002,
    nickname: '테스트유저2',
    introduce: null,
    profile_image_url: null,
  })
}
if (!mockProfiles.has(9003)) {
  mockProfiles.set(9003, {
    user_id: 9003,
    nickname: null, // 닉네임 미설정 계정도 팔로우 목록에 섞일 수 있다 — 그 케이스 재현.
    introduce: null,
    profile_image_url: null,
  })
}
saveProfiles()

/** Authorization 헤더의 JWT에서 sub(=user_id)를 꺼낸다. 실서버가 발급한 진짜 토큰을 읽기만 한다. */
function getViewerId(request: Request): number | null {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const base64Url = auth.slice('Bearer '.length).split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const { sub } = JSON.parse(atob(padded)) as { sub?: string }
    return sub ? Number(sub) : null
  } catch {
    return null
  }
}

/**
 * 글을 쓰는 순간의 작성자 정보 — 요청자(JWT sub)와 그가 저장해 둔 프로필(mockProfiles)에서 만든다.
 *
 * 예전엔 MOCK_ME 상수를 그대로 박아 넣었다. 그래서 (1) 프로필에서 닉네임을 바꿔도 내가 쓴 글의
 * 작성자는 영영 '나'였고, (2) 작성자 user_id가 999로 고정돼 내 프로필 그리드에서도 내 글을
 * 찾을 수 없었다. 실제 서버는 인증 주체(user_id)로 저장하므로 그 모양에 맞춘다.
 */
function mockAuthorOf(request: Request): PostAuthor {
  const viewerId = getViewerId(request)
  if (viewerId === null) return MOCK_ME
  const profile = mockProfiles.get(viewerId)
  return {
    user_id: viewerId,
    nickname: profile?.nickname ?? MOCK_ME.nickname,
    profile_image_url: profile?.profile_image_url ?? null,
  }
}

/**
 * 조회 시점의 최신 프로필을 작성자 정보에 덮어쓴다 — 실제 서버가 posts와 users를
 * JOIN해서 내려주는 것과 같은 효과.
 *
 * 게시물이 작성자 이름·사진을 응답에 복사해 들고 있기 때문에(PostAuthor), 저장된 값만
 * 돌려주면 프로필을 바꿔도 **이미 쓴 글**의 이름이 안 바뀐다. 프로필이 목에 없는
 * 시드 유저(101~104)는 저장된 값을 그대로 쓴다.
 */
function resolveAuthor(author: PostAuthor): PostAuthor {
  const profile = mockProfiles.get(author.user_id)
  if (!profile) return author
  return {
    user_id: author.user_id,
    nickname: profile.nickname ?? author.nickname,
    profile_image_url: profile.profile_image_url ?? author.profile_image_url,
  }
}

// ── follow: 팔로우/언팔로우·수·목록 (백엔드 미구현 — msw 목 대상 임시 계약) ──
// followerId -> 그가 팔로우하는 사람들의 id 집합. mockProfiles와 같은 이유로 sessionStorage에 백업.
const mockFollowGraph = new Map<number, Set<number>>(
  loadJSON<[number, number[]][]>(FOLLOW_GRAPH_STORAGE_KEY, []).map(
    ([id, list]) => [id, new Set(list)],
  ),
)

function saveFollowGraph() {
  const entries = [...mockFollowGraph.entries()].map(([id, set]) => [id, [...set]])
  sessionStorage.setItem(FOLLOW_GRAPH_STORAGE_KEY, JSON.stringify(entries))
}

function followingSetOf(userId: number): Set<number> {
  let set = mockFollowGraph.get(userId)
  if (!set) {
    set = new Set()
    mockFollowGraph.set(userId, set)
  }
  return set
}

function isFollowingMock(followerId: number, targetId: number): boolean {
  return mockFollowGraph.get(followerId)?.has(targetId) ?? false
}

function followerCountOf(userId: number): number {
  let count = 0
  for (const set of mockFollowGraph.values()) {
    if (set.has(userId)) count += 1
  }
  return count
}

/**
 * id로 유저 정보를 찾는다. 이 목이 아는 계정(mockProfiles)이면 그대로 쓰고,
 * 아니면(권영민 등 실제 가입 계정) GET /api/users/:id를 다시 불러서 진짜 닉네임을
 * 가져온다 — 그 요청도 같은 msw 안에서 처리되므로, 우리가 모르는 id면 위
 * '회원 단건 조회' 핸들러가 알아서 실서버로 passthrough한다.
 * (이전엔 그냥 "유저{id}"로 지어냈는데, 실제 가입 계정을 팔로우하면 엉뚱한
 * 이름으로 보이는 버그가 있었다.)
 */
async function resolveUserSummary(userId: number, authHeader: string | null) {
  const cached = mockProfiles.get(userId)
  if (cached) {
    return {
      user_id: userId,
      nickname: cached.nickname,
      introduce: cached.introduce,
      profile_image_url: cached.profile_image_url,
    }
  }
  try {
    const res = await fetch(`/api/users/${userId}`, {
      headers: authHeader ? { Authorization: authHeader } : undefined,
    })
    if (res.ok) {
      const json = (await res.json()) as { data?: Record<string, unknown> }
      const data = json.data ?? {}
      return {
        user_id: userId,
        nickname: (data.nickname as string | undefined) ?? null,
        introduce: (data.introduce as string | undefined) ?? null,
        profile_image_url: (data.profile_image_url as string | undefined) ?? null,
      }
    }
  } catch {
    // 네트워크 실패 등 — 아래 자리표시자로 대체한다.
  }
  return { user_id: userId, nickname: `유저${userId}`, introduce: null, profile_image_url: null }
}

// ── posts: 프로필 하단 게시글 그리드 (백엔드 미구현 — msw 목 대상 임시 계약) ──
// 명세서에 이 API 문서가 따로 없어서, 팔로우 목록과 같은 형태(content/next_cursor/
// has_next)로 맞췄다.
//
// 피드 저장소(mockPosts)에서 그 사람이 쓴 글만 뽑는다 — 실제 서버가 posts를 작성자로
// 조회하는 것과 같은 모양이다. 예전엔 user_id로 가짜 목록을 그때그때 지어냈는데,
// 그러면 목 모드에서 글을 써도(POST /api/posts는 mockPosts에 넣는다) 그리드는 딴 곳을
// 보고 있어서 "게시물이 프로필에 안 올라간다"가 됐다.
// 글이 없는 사람은 빈 배열이다(ProfilePage가 그리드를 아예 그리지 않음).
function mockPostsFor(userId: number) {
  return mockPosts
    .filter((post) => post.author.user_id === userId)
    .sort((a, b) => b.post_id - a.post_id)
    .map((post) => ({
      post_id: post.post_id,
      // 카드뉴스는 thumbnail_url이 없다 — 실제 서버가 그렇듯 첫 이미지를 대표컷으로 쓴다.
      thumbnail_url: post.thumbnail_url ?? post.image_urls[0] ?? null,
      post_type: post.post_type,
    }))
}

// ── github: 프로필 기술스택·잔디 ──────────────────────────────────
// 실제 명세는 GET /api/github(내 계정 전용)뿐이라 다른 사람 프로필에 상시 노출하는
// 용도로는 못 쓴다. 그 공개 조회 엔드포인트가 스펙에 없는 걸 백엔드팀에 보고할 때까지,
// 프론트는 GET /api/users/:userId/github로 임시 대체한다.
// 응답 스키마는 features/profile/types.ts의 UserGithubResponse(공통 규약대로 snake_case)를
// 그대로 따른다. 이전 버전은 camelCase(githubLogin/techStacks)에 developerType·
// activitySummary까지 담고 있었는데, 그 둘은 실제 응답에 없는 필드로 확인돼 삭제됐다.
// 9003(닉네임 미설정 테스트 유저)은 GitHub 미연동 케이스도 겸해서, 실제 에러 코드와
// 동일하게 404 GITHUB_NOT_CONNECTED로 응답한다.
const GITHUB_NOT_CONNECTED_USER_IDS = new Set([9003])

/**
 * 배지 12종 정의 — 실서버 BadgeCode enum(be-badge)의 label·threshold를 그대로 옮겼다.
 * **티어 오름차순으로 둔다** — 위 핸들러가 축별 최고 등급을 고를 때 뒤가 이기는 규칙이라
 * 순서가 바뀌면 브론즈가 골드를 덮는다.
 */
const MOCK_BADGE_AXIS_LABELS = {
  POST: '게시',
  LIKE: '받은 좋아요',
  COMMENT: '댓글 활동',
  GITHUB: 'GitHub',
} as const

const MOCK_BADGE_CODES = [
  { code: 'POST_BRONZE', label: '첫 발자국', axis: 'POST', tier: 'BRONZE', threshold: 1 },
  { code: 'POST_SILVER', label: '꾸준한 기록', axis: 'POST', tier: 'SILVER', threshold: 10 },
  { code: 'POST_GOLD', label: '기록 장인', axis: 'POST', tier: 'GOLD', threshold: 30 },
  { code: 'LIKE_BRONZE', label: '관심의 시작', axis: 'LIKE', tier: 'BRONZE', threshold: 10 },
  { code: 'LIKE_SILVER', label: '인기 프로젝트', axis: 'LIKE', tier: 'SILVER', threshold: 50 },
  { code: 'LIKE_GOLD', label: '커뮤니티 등대', axis: 'LIKE', tier: 'GOLD', threshold: 200 },
  { code: 'COMMENT_BRONZE', label: '첫 마디', axis: 'COMMENT', tier: 'BRONZE', threshold: 10 },
  { code: 'COMMENT_SILVER', label: '번개 답변', axis: 'COMMENT', tier: 'SILVER', threshold: 50 },
  { code: 'COMMENT_GOLD', label: '멘토', axis: 'COMMENT', tier: 'GOLD', threshold: 200 },
  { code: 'GITHUB_BRONZE', label: '잔디 심기', axis: 'GITHUB', tier: 'BRONZE', threshold: 1 },
  { code: 'GITHUB_SILVER', label: '열정 커밋', axis: 'GITHUB', tier: 'SILVER', threshold: 30 },
  { code: 'GITHUB_GOLD', label: '오픈소스 기여자', axis: 'GITHUB', tier: 'GOLD', threshold: 100 },
] as const satisfies ReadonlyArray<{
  code: string
  label: string
  axis: keyof typeof MOCK_BADGE_AXIS_LABELS
  tier: 'BRONZE' | 'SILVER' | 'GOLD'
  threshold: number
}>

/**
 * 사용자별로 고른 관심 태그 id — 저장(POST /api/profiles)에서 쓰고
 * 조회(GET /api/users/{id}/interests)에서 읽는다. 실서버 user_interests 테이블 역할.
 *
 * mockProfiles와 같은 이유로 sessionStorage에 남긴다: 새로고침이나 재로그인으로 페이지가
 * 통째로 다시 로드돼도 저장한 값이 살아 있어야 "저장 → 재진입 복원"을 확인할 수 있다.
 * 메모리에만 두면 리로드마다 지워져 실서버와 다르게 동작한다.
 */
const INTERESTS_STORAGE_KEY = 'msw:mockUserInterests'

const mockUserInterests = new Map<number, number[]>(
  loadJSON<[number, number[]][]>(INTERESTS_STORAGE_KEY, []),
)

function saveInterests() {
  sessionStorage.setItem(
    INTERESTS_STORAGE_KEY,
    JSON.stringify([...mockUserInterests.entries()]),
  )
}

/** 관심 태그 마스터(GET /api/tags). tag_id는 목 안에서만 유효한 임의 값이다. */
const MOCK_TAGS: Array<{ tag_id: number; tag_type: 'TECH' | 'POSITION' | 'DOMAIN'; tag_name: string }> = [
  'React', 'TypeScript', 'Vue', 'Next.js', 'Java', 'Spring Boot',
  'Python', 'Node.js', 'Go', 'Kotlin', 'MySQL', 'Redis', 'Docker', 'AWS',
].map((tag_name, i) => ({ tag_id: i + 1, tag_type: 'TECH', tag_name }))

const TECH_STACK_POOL = [
  'React', 'TypeScript', 'Vue', 'Java', 'Spring Boot',
  'Python', 'Node.js', 'Go', 'MySQL', 'Redis', 'Docker', 'AWS',
]

function mockTechStacksFor(userId: number): { name: string; percentage: number }[] {
  const count = (userId % 3) + 2
  const names = Array.from(
    { length: count },
    (_, i) => TECH_STACK_POOL[(userId + i * 3) % TECH_STACK_POOL.length],
  )
  // 비율 합이 100이 되도록 앞에서부터 절반씩 채우고, 마지막 항목이 나머지를 가져간다.
  const percentages: number[] = []
  let remaining = 100
  names.forEach((_, i) => {
    if (i === names.length - 1) {
      percentages.push(remaining)
      return
    }
    const share = Math.round(remaining / 2)
    percentages.push(share)
    remaining -= share
  })
  return names.map((name, i) => ({ name, percentage: percentages[i] }))
}

// Math.random 대신 시드 기반으로 새로고침해도 같은 잔디가 나오게 한다.
function seededCount(seed: number): number {
  const x = Math.sin(seed) * 10000
  return Math.floor((x - Math.floor(x)) * 11) // 0~10
}

// 53주 x 7일 = 371칸. 날짜는 window53()이 만든 것을 그대로 쓴다(from은 일요일, to는 토요일).
// 직접 toISOString()으로 만들면 KST 새벽에 UTC 기준으로 하루 밀려 전부 0이 되는 함정이 있다.
function mockContributionsFor(userId: number) {
  return window53().map((date, i) => ({ date, count: seededCount(userId * 1000 + i) }))
}

/**
 * 활동일수(최근 1년간 커밋한 날 수) 기반 커밋 배지.
 * 임계값·라벨·색상은 백엔드 enum(feature/be-github의 domain/github/entity/CommitBadge.java)
 * 실제 값이다. NONE(활동일 0)은 응답에서 키 자체가 생략된다(non_null 직렬화).
 */
function mockGithubBadge(activeDays: number): GithubBadge | undefined {
  const tiers = [
    { tier: 'GOLD', label: '골드', color: '#FFD700', min_active_days: 100 },
    { tier: 'SILVER', label: '실버', color: '#C0C0C0', min_active_days: 30 },
    { tier: 'BRONZE', label: '브론즈', color: '#CD7F32', min_active_days: 1 },
  ] as const satisfies readonly GithubBadge[]
  return tiers.find((b) => activeDays >= b.min_active_days)
}

// ── search: 통합 검색·최근 검색어 (백엔드 domain/search 미구현 — msw 목 대상 임시 계약) ──
// 노션 명세(검색 실행/최근 검색/기록 저장·삭제)를 백엔드 실제 규약(ApiResponse + snake_case)으로
// 변환해 재현한다 — 명세와 다르게 정의한 지점은 features/search/types.ts 상단 주석 참고.

const SEARCH_TYPES = ['ALL', 'POST', 'USER', 'TECH_STACK'] as const
type MockSearchType = (typeof SEARCH_TYPES)[number]

const SEARCH_HISTORY_STORAGE_KEY = 'msw:mockSearchHistory'

interface MockRecentSearch {
  history_id: number
  keyword: string
  type: MockSearchType
  searched_at: string
}

// userId -> 최신순 목록. mockProfiles와 같은 이유로 sessionStorage에 백업한다.
const mockSearchHistory = new Map<number, MockRecentSearch[]>(
  loadJSON<[number, MockRecentSearch[]][]>(SEARCH_HISTORY_STORAGE_KEY, []),
)

// 복원한 기록보다 큰 값에서 이어간다 — 겹치면 삭제(history_id 기준)가 엉뚱한 걸 지운다.
let nextHistoryId =
  1 + Math.max(0, ...[...mockSearchHistory.values()].flat().map((h) => h.history_id))

function saveSearchHistoryStore() {
  sessionStorage.setItem(
    SEARCH_HISTORY_STORAGE_KEY,
    JSON.stringify([...mockSearchHistory.entries()]),
  )
}

/**
 * 검색 실행·결과 클릭 시 호출 — 같은 검색어는 지우고 최상단에 다시 넣는다
 * (명세: 중복 시 갱신, 유저당 최대 10개). history_id는 기존 것을 유지해
 * 화면이 항목을 추적하는 키가 흔들리지 않게 한다.
 */
function upsertSearchHistory(userId: number, keyword: string, type: MockSearchType) {
  const list = mockSearchHistory.get(userId) ?? []
  const existingIndex = list.findIndex((h) => h.keyword === keyword)
  const historyId = existingIndex === -1 ? nextHistoryId++ : list[existingIndex].history_id
  if (existingIndex !== -1) list.splice(existingIndex, 1)
  list.unshift({
    history_id: historyId,
    keyword,
    type,
    searched_at: new Date().toISOString(),
  })
  mockSearchHistory.set(userId, list.slice(0, 10))
  saveSearchHistoryStore()
}

/**
 * 닉네임 부분 일치 — 시드 사용자 + 이 목이 아는 프로필(테스트유저·직접 저장한 것)을 합친다.
 * 같은 user_id면 프로필 쪽이 이긴다(닉네임을 바꿨으면 바뀐 이름으로 검색돼야 하므로).
 * id 내림차순 정렬은 커서 페이징 기준이다.
 */
function searchUsersMock(keyword: string) {
  const kw = keyword.toLowerCase()
  const byId = new Map<
    number,
    { user_id: number; nickname: string; profile_image_url: string | null }
  >()
  for (const user of MOCK_USERS) byId.set(user.user_id, user)
  for (const profile of mockProfiles.values()) {
    if (profile.nickname) {
      byId.set(profile.user_id, {
        user_id: profile.user_id,
        nickname: profile.nickname,
        profile_image_url: profile.profile_image_url,
      })
    }
  }
  return [...byId.values()]
    .filter((user) => user.nickname.toLowerCase().includes(kw))
    .sort((a, b) => b.user_id - a.user_id)
}

/** 본문 부분 일치 — 명세의 '게시물명' 검색인데 posts에 title이 없어 content 매칭으로 대체. */
function searchPostsMock(keyword: string) {
  const kw = keyword.toLowerCase()
  return [...mockPosts]
    .filter((post) => post.content.toLowerCase().includes(kw))
    .sort((a, b) => b.post_id - a.post_id)
    .map((post) => ({
      post_id: post.post_id,
      content_preview: post.content,
      thumbnail_url: post.thumbnail_url ?? post.image_urls[0] ?? null,
      author: { user_id: post.author.user_id, nickname: post.author.nickname },
    }))
}

/** 기술스택 태그 부분 일치 — 검색어와 매칭된 태그만 matched_stacks로 돌려준다. */
function searchStacksMock(keyword: string) {
  const kw = keyword.toLowerCase()
  return [...mockPosts]
    .map((post) => ({
      post,
      matched: post.tech_stacks.filter((tag) => tag.toLowerCase().includes(kw)),
    }))
    .filter(({ matched }) => matched.length > 0)
    .sort((a, b) => b.post.post_id - a.post.post_id)
    .map(({ post, matched }) => ({
      post_id: post.post_id,
      content_preview: post.content,
      thumbnail_url: post.thumbnail_url ?? post.image_urls[0] ?? null,
      matched_stacks: matched,
    }))
}

// ── 구글 소셜 로그인 ──────────────────────────────────────────
// 실제 백엔드(POST /api/auth/social/google)는 이미 구현돼 있다. 이 목은 "구글 Client ID가
// 아직 없어도 콜백 페이지(OAuthCallbackPage) 이후 로직(is_new 분기, 에러 처리)을 검증하고
// 싶을 때"용 — 주소창에 /oauth/callback/google?code=...&state=... 를 직접 쳐서 확인한다.
// code로 시나리오를 나눈다: 'fail'이면 인가 코드 오류, 'new'가 들어가면 신규가입.
function fakeJwt(userId: number): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ sub: String(userId) }))
  return `${header}.${payload}.mock-signature`
}

/**
 * 목 모드용 Refresh 쿠키 대역.
 *
 * 실서버는 로그인 응답에 HttpOnly Refresh 쿠키를 심고, 새로고침하면 앱이 그 쿠키로
 * silent refresh(POST /api/auth/reissue)를 해서 세션을 되살린다(api/client.ts).
 * 목은 요청이 서버까지 가지 않으니 그 쿠키가 생길 수가 없어서, 목 로그인 = 새로고침 즉시
 * 로그아웃이었다. 그래서 평범한 세션 쿠키로 흉내낸다.
 *
 * HttpOnly가 아닌 이유: msw 핸들러는 페이지 컨텍스트에서 돌고 JS로는 HttpOnly를 만들 수 없다.
 * 담는 값이 user_id뿐인 이유: 액세스 토큰을 스토리지/쿠키에 두지 않는다는 규칙(CLAUDE.md
 * 절대규칙 1)을 목에서도 깨지 않는다. 토큰은 여기서도 메모리(Zustand)에만 남는다.
 * Max-Age를 안 주므로 탭을 닫으면 사라진다 — 실서버 Refresh 만료와 비슷하게 움직인다.
 */
const MOCK_REFRESH_COOKIE = 'hw_mock_refresh'

function readMockRefresh(): number | null {
  const hit = document.cookie
    .split('; ')
    .find((chunk) => chunk.startsWith(`${MOCK_REFRESH_COOKIE}=`))
  if (!hit) return null
  const userId = Number(hit.slice(MOCK_REFRESH_COOKIE.length + 1))
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

function writeMockRefresh(userId: number): void {
  document.cookie = `${MOCK_REFRESH_COOKIE}=${userId}; path=/; SameSite=Lax`
}

function clearMockRefresh(): void {
  document.cookie = `${MOCK_REFRESH_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

// ── DM: 유저 검색·채팅방 생성/재사용 (백엔드 미구현 — msw 목 대상 임시 계약) ──
// 실제 명세 문서는 ApiResponse 래퍼 없이 camelCase였지만, 이 프로젝트는 모든 API가
// ApiResponse+snake_case라 그 컨벤션으로 맞췄다(features/chat/types.ts 주석 참고).
// 검색은 mockProfiles(9001~9003 + 프로필을 설정해본 계정들)에서만 찾는다 — 이 앱에
// "전체 회원 목록" 조회 API가 없어서 실제 가입 계정까지는 검색 대상에 못 넣는다.
const CHAT_ROOMS_STORAGE_KEY = 'msw:mockChatRooms'
// pairKey(작은 id_큰 id) -> room_id. 1:1 방 재사용 로직(pair_key 유니크) 재현.
const mockChatRooms = new Map<string, number>(
  loadJSON<[string, number][]>(CHAT_ROOMS_STORAGE_KEY, []),
)
let nextRoomId = 5001 + mockChatRooms.size

function saveChatRooms() {
  sessionStorage.setItem(CHAT_ROOMS_STORAGE_KEY, JSON.stringify([...mockChatRooms.entries()]))
}

function pairKeyOf(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

// 그룹방(3명 이상 포함, target_user_ids 2개 이상)은 1:1처럼 쌍 재사용 개념이 없어
// mockChatRooms(pairKey 기반)와는 별도 저장소를 쓴다. room_id -> 멤버 user_id 전체(나 포함).
const GROUP_ROOMS_STORAGE_KEY = 'msw:mockGroupRooms'
const mockGroupRooms = new Map<number, number[]>(
  loadJSON<[number, number[]][]>(GROUP_ROOMS_STORAGE_KEY, []),
)

function saveGroupRooms() {
  sessionStorage.setItem(GROUP_ROOMS_STORAGE_KEY, JSON.stringify([...mockGroupRooms.entries()]))
}

// 메시지 조회 API 호출 = "이 방을 보고 있다" → 서버가 안읽음을 리셋한다는 명세 부수효과를
// 재현하려면 "누가 어느 방을 읽었는지" 상태가 필요하다. `${viewerId}_${roomId}` 키로 저장.
// (실시간 읽음 이벤트 발행 — WebSocket 쪽 — 은 아직 백엔드에 없어 흉내내지 않는다.)
const CHAT_READ_ROOMS_STORAGE_KEY = 'msw:mockChatReadRooms'
const mockReadRooms = new Set<string>(loadJSON<string[]>(CHAT_READ_ROOMS_STORAGE_KEY, []))

function saveReadRooms() {
  sessionStorage.setItem(CHAT_READ_ROOMS_STORAGE_KEY, JSON.stringify([...mockReadRooms]))
}

function readKeyOf(viewerId: number, roomId: number): string {
  return `${viewerId}_${roomId}`
}

// 대화 목록의 마지막 메시지 미리보기용 — 실제 메시지 전송 기능은 아직 없어서 지어낸다.
// 실제 명세는 "메시지 0건인 방은 목록에 없음"이지만, 방금 만든 방도 화면에서 바로
// 확인할 수 있어야 목록 기능 자체를 테스트할 수 있어서 전부 가짜 미리보기를 채운다.
const MOCK_LAST_MESSAGES = [
  '내일 회의 몇 시예요?',
  'ㅋㅋㅋㅋ 그러게요',
  '넵 확인했습니다!',
  '지금 이동 중이에요',
  '자료 공유드릴게요',
]

// 메시지 조회용 가짜 대화 이력. room_id 기준으로 결정적이라 새로고침해도 같은 내용.
// 45개 이상 만들어서(초기 20개 + 과거 방향 페이징) 무한 스크롤도 테스트할 수 있게 한다.
const MOCK_MESSAGE_TEMPLATES = [
  '안녕하세요!',
  '네 반갑습니다',
  '이번 주에 시간 되세요?',
  '넵 가능할 것 같아요',
  'ㅋㅋㅋㅋㅋ',
  '자료 확인해봤어요',
  '좋은데요?',
  '조금만 더 다듬을게요',
  '넵 감사합니다!',
  '내일 다시 이야기해요',
]

function mockMessagesFor(roomId: number, viewerId: number, partnerId: number) {
  const count = 45 + (roomId % 10)
  return Array.from({ length: count }, (_, i) => ({
    message_id: roomId * 1000 + i,
    room_id: roomId,
    sender_id: i % 2 === 0 ? partnerId : viewerId,
    message_type: 'TEXT' as const,
    content: MOCK_MESSAGE_TEMPLATES[(roomId + i) % MOCK_MESSAGE_TEMPLATES.length],
    client_message_id: null,
    is_deleted: false,
    // 5분 간격, 오름차순(과거 → 최신)이 되도록 뒤로 갈수록(= i가 클수록) 최근 시각.
    sent_at: new Date(Date.now() - (count - i) * 5 * 60_000).toISOString(),
  }))
}

export const handlers = [
  /**
   * 백엔드 없이 화면을 확인하기 위한 로컬 디자인 계정.
   * 이 계정만 목으로 처리하고, 다른 이메일은 실서버로 통과시켜 혼합 개발 흐름을 유지한다.
   */
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.clone().json()) as {
      email?: string
      password?: string
    } | null

    if (
      body?.email !== 'designer@local.dev' ||
      body.password !== 'design1234!'
    ) {
      return passthrough()
    }

    const userId = 9001
    await delay(250)
    writeMockRefresh(userId)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '로컬 디자인 계정으로 로그인했습니다.',
      data: {
        access_token: fakeJwt(userId),
        token_type: 'Bearer',
        expires_in: 1800,
        user: {
          user_id: userId,
          email: body.email,
        },
      },
    })
  }),

  http.post('/api/auth/social/google', async ({ request }) => {
    await delay(400)
    const body = (await request.json()) as { code?: string } | null
    if (body?.code === 'fail') {
      return HttpResponse.json(
        {
          status: 'ERROR',
          code: 'AUTH_INVALID_SOCIAL_CODE',
          message: '소셜 인가 코드가 만료되었거나 유효하지 않습니다.',
        },
        { status: 401 },
      )
    }
    const isNew = body?.code?.includes('new') ?? false
    const userId = isNew ? 9101 : 9001
    // 실서버가 HttpOnly Refresh 쿠키를 심는 자리 — 목도 심어야 새로고침이 살아남는다.
    writeMockRefresh(userId)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '소셜 로그인에 성공하였습니다.',
      data: {
        access_token: fakeJwt(userId),
        token_type: 'Bearer',
        expires_in: 1800,
        user_id: userId,
        is_new: isNew,
      },
    })
  }),

  /**
   * 액세스 토큰 재발급 (silent refresh) — api/client.ts가 앱 부팅 시 1회, 그리고 401마다 부른다.
   *
   * 목 로그인으로 생긴 세션일 때만 응답하고, 아니면 passthrough()로 실서버에 넘긴다.
   * 이 분기가 중요하다: 목 모드에서도 일반 로그인(POST /api/auth/login)은 목이 없어 실서버로
   * 가고 백엔드가 진짜 Refresh 쿠키를 심는다. 여기서 무조건 401을 뱉으면 그렇게 로그인한
   * 실계정이 새로고침마다 튕긴다.
   */
  http.post('/api/auth/reissue', async () => {
    const userId = readMockRefresh()
    if (userId === null) return passthrough()
    await delay(200)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '토큰이 재발급되었습니다.',
      data: { access_token: fakeJwt(userId) },
    })
  }),

  /** 로그아웃 — 목 세션이면 흉내낸 Refresh 쿠키를 지운다(안 지우면 목 모드에서 로그아웃이 안 된다). */
  http.post('/api/auth/logout', async () => {
    if (readMockRefresh() === null) return passthrough()
    clearMockRefresh()
    await delay(150)
    return HttpResponse.json({ status: 'SUCCESS', message: '로그아웃되었습니다.', data: null })
  }),

  // ── DM: 채팅방 생성/재사용 ──
  http.post('/api/chat/rooms', async ({ request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const body = (await request.json()) as { target_user_ids?: number[] } | null
    const targetIds = body?.target_user_ids ?? []
    if (targetIds.length === 0) {
      return HttpResponse.json(
        { status: 'FAIL', code: 'COMMON_INVALID_PARAM', message: '잘못된 요청입니다.' },
        { status: 400 },
      )
    }
    if (targetIds.includes(viewerId)) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'CHAT_CANNOT_INVITE_SELF', message: '자기 자신과는 대화할 수 없습니다.' },
        { status: 400 },
      )
    }

    // 2명 이상 지정하면 GROUP — 1:1과 달리 쌍 재사용 개념이 없어 항상 새로 만든다.
    if (targetIds.length >= 2) {
      const roomId = nextRoomId++
      mockGroupRooms.set(roomId, [viewerId, ...targetIds])
      saveGroupRooms()
      return HttpResponse.json({
        status: 'SUCCESS',
        message: '요청이 처리되었습니다.',
        data: { room_id: roomId, room_type: 'GROUP', is_new: true },
      })
    }

    const targetId = targetIds[0]
    const key = pairKeyOf(viewerId, targetId)
    const existingRoomId = mockChatRooms.get(key)
    if (existingRoomId !== undefined) {
      return HttpResponse.json({
        status: 'SUCCESS',
        message: '요청이 처리되었습니다.',
        data: { room_id: existingRoomId, room_type: 'DIRECT', is_new: false },
      })
    }

    const roomId = nextRoomId++
    mockChatRooms.set(key, roomId)
    saveChatRooms()
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { room_id: roomId, room_type: 'DIRECT', is_new: true },
    })
  }),

  // ── DM: 대화 목록 조회 (keyword 검색 + beforeLastMessageId/beforeRoomId 커서 페이징) ──
  // 실제 백엔드(be-chat-read)로 확인한 계약: counterparts/room_type/title,
  // last_message는 방에 메시지가 없으면 null, page_info는 (마지막메시지id, room_id) 커서.
  http.get('/api/chat/rooms', async ({ request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const authHeader = request.headers.get('Authorization')
    const url = new URL(request.url)
    const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
    // 쿼리 파라미터는 snake_case다 — 앱이 그렇게 보낸다(features/chat/api.ts getChatRooms).
    // camelCase로 읽던 동안은 커서가 항상 null이라 아래 필터가 통째로 죽은 코드였고,
    // 목 모드에서 대화 목록 무한 스크롤이 같은 첫 페이지만 반복해 돌려줬다.
    const beforeLastMessageId = Number(url.searchParams.get('before_last_message_id')) || null
    const beforeRoomId = Number(url.searchParams.get('before_room_id')) || null
    const size = Number(url.searchParams.get('size')) || 20

    const myRoomEntries = [...mockChatRooms.entries()]
      .map(([pairKey, roomId]) => {
        const [a, b] = pairKey.split('_').map(Number)
        if (a !== viewerId && b !== viewerId) return null
        const partnerId = a === viewerId ? b : a
        return { roomId, partnerId }
      })
      .filter((entry) => entry !== null)

    const directRooms = await Promise.all(
      myRoomEntries.map(async ({ roomId, partnerId }) => {
        const partner = await resolveUserSummary(partnerId, authHeader)
        // 정렬·커서용 프록시 — 실제 message_id 체계와는 무관, room_id가 클수록(=최근에
        // 만든 방일수록) 최근으로 취급한다(기존 mock의 sent_at 트릭과 같은 방식).
        const lastMessageId = roomId
        return {
          room_id: roomId,
          room_type: 'DIRECT' as const,
          title: null,
          counterparts: [
            {
              user_id: partner.user_id,
              nickname: partner.nickname,
              profile_image_url: partner.profile_image_url,
            },
          ],
          last_message: {
            message_id: lastMessageId,
            sender_id: partner.user_id,
            content: MOCK_LAST_MESSAGES[roomId % MOCK_LAST_MESSAGES.length],
            is_deleted: false,
            sent_at: new Date(Date.now() - (100_000 - roomId) * 1000).toISOString(),
          },
          // 이 방을 읽은 적 있으면 0, 아니면 room_id 기반 가짜 안읽음 수.
          unread_count: mockReadRooms.has(readKeyOf(viewerId, roomId)) ? 0 : roomId % 4,
          last_read_message_id: null,
          _sortKey: lastMessageId,
        }
      }),
    )

    // 그룹방(NewGroupModal로 생성) — 메시지 이력을 지어내지 않으므로
    // last_message는 항상 null, unread_count는 항상 0(방금 만들었을 때뿐이라 자연스럽다).
    const myGroupEntries = [...mockGroupRooms.entries()].filter(([, members]) =>
      members.includes(viewerId),
    )
    const groupRooms = await Promise.all(
      myGroupEntries.map(async ([roomId, members]) => {
        const counterparts = await Promise.all(
          members
            .filter((id) => id !== viewerId)
            .map(async (id) => {
              const u = await resolveUserSummary(id, authHeader)
              return { user_id: u.user_id, nickname: u.nickname, profile_image_url: u.profile_image_url }
            }),
        )
        return {
          room_id: roomId,
          room_type: 'GROUP' as const,
          title: null,
          counterparts,
          last_message: null,
          unread_count: 0,
          last_read_message_id: null,
          _sortKey: roomId,
        }
      }),
    )

    let rooms = [...directRooms, ...groupRooms]

    if (keyword) {
      rooms = rooms.filter((room) =>
        room.counterparts.some((p) => p.nickname?.toLowerCase().includes(keyword)),
      )
    }
    rooms.sort((a, b) =>
      a._sortKey === b._sortKey ? b.room_id - a.room_id : b._sortKey - a._sortKey,
    )
    if (beforeLastMessageId !== null && beforeRoomId !== null) {
      rooms = rooms.filter(
        (room) =>
          room._sortKey < beforeLastMessageId ||
          (room._sortKey === beforeLastMessageId && room.room_id < beforeRoomId),
      )
    }

    const page = rooms.slice(0, size)
    const hasNext = rooms.length > size
    const tail = page[page.length - 1]

    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: {
        rooms: page.map(({ _sortKey, ...room }) => room),
        page_info: {
          has_next: hasNext,
          next_cursor_last_message_id: tail ? tail._sortKey : null,
          next_cursor_room_id: tail ? tail.room_id : null,
        },
      },
    })
  }),

  /*
   * 알림 안읽음 수 (사이드바 뱃지 초기값) · 관심 태그 마스터 목록.
   *
   * 둘 다 화면에서 직접 쓰이진 않지만 **목이 없으면 목 모드 전체가 못 쓰게 된다.**
   * 앱이 로그인 직후 이 둘을 부르는데(main.tsx의 resyncNotificationBadge,
   * 프로필 설정의 useTags), 핸들러가 없으면 passthrough로 실서버에 가고 목 로그인의
   * 가짜 JWT는 거기서 401을 맞는다 → client.ts 인터셉터가 재발급·재시도까지 실패로 보고
   * clearAuth()를 호출 → 로그인 1초 만에 /login으로 튕긴다.
   */
  http.get('/api/notifications/unread-count', ({ request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { unread_count: 0 },
    })
  }),

  // 관심 태그 마스터. type 파라미터로 종류를 거를 수 있다(프로필 설정은 TECH만 쓴다).
  /*
   * 사용자가 고른 관심 태그 — 편집 화면 복원용.
   * 저장(POST /api/profiles)에서 넣은 값을 그대로 돌려줘야 복원이 의미가 있으므로
   * mockUserInterests에 담아 두고 여기서 읽는다. 없으면 빈 배열이 정상이다.
   */
  http.get('/api/users/:userId/interests', ({ params }) => {
    const ids = mockUserInterests.get(Number(params.userId)) ?? []
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청에 성공하였습니다.',
      data: MOCK_TAGS.filter((tag) => ids.includes(tag.tag_id)),
    })
  }),

  http.get('/api/tags', ({ request }) => {
    const type = new URL(request.url).searchParams.get('type')
    const list = type ? MOCK_TAGS.filter((t) => t.tag_type === type) : MOCK_TAGS
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청에 성공하였습니다.',
      data: list,
    })
  }),

  // ── DM: 전체 안읽음 수 (사이드바 뱃지 초기값) ──
  http.get('/api/chat/rooms/unread-count', ({ request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const total = [...mockChatRooms.entries()].reduce((sum, [pairKey, roomId]) => {
      const [a, b] = pairKey.split('_').map(Number)
      if (a !== viewerId && b !== viewerId) return sum
      const unread = mockReadRooms.has(readKeyOf(viewerId, roomId)) ? 0 : roomId % 4
      return sum + unread
    }, 0)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { unread_count: total },
    })
  }),

  // ── DM: 메시지 조회 (before/after 커서 하나로 초기 로드·과거 페이징·갭 복구 겸용) ──
  http.get('/api/chat/rooms/:roomId/messages', ({ request, params }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }

    const url = new URL(request.url)
    const beforeParam = url.searchParams.get('before')
    const afterParam = url.searchParams.get('after')
    if (beforeParam && afterParam) {
      return HttpResponse.json(
        { status: 'FAIL', code: 'COMMON_INVALID_PARAM', message: 'before·after는 동시에 지정할 수 없습니다.' },
        { status: 400 },
      )
    }

    const roomId = Number(params.roomId)

    // 그룹방은 메시지 이력을 지어내지 않는다(만든 시점엔 항상 비어있음) — 참여자만
    // 확인하고 빈 목록을 돌려준다. 실시간 전송은 STOMP를 목으로 안 만들어서 어차피
    // 목 모드에서는 메시지를 못 주고받는다(CLAUDE.md 참고).
    const groupMembers = mockGroupRooms.get(roomId)
    if (groupMembers) {
      if (!groupMembers.includes(viewerId)) {
        return HttpResponse.json(
          { status: 'ERROR', code: 'CHAT_NOT_PARTICIPANT', message: '채팅방 참여자가 아닙니다.' },
          { status: 403 },
        )
      }
      return HttpResponse.json({
        status: 'SUCCESS',
        message: '요청이 처리되었습니다.',
        data: {
          messages: [],
          page_info: {
            has_previous: false,
            has_next: false,
            oldest_message_id: null,
            newest_message_id: null,
          },
        },
      })
    }

    const entry = [...mockChatRooms.entries()].find(([, id]) => id === roomId)
    if (!entry) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'CHAT_ROOM_NOT_FOUND', message: '존재하지 않는 채팅방입니다.' },
        { status: 404 },
      )
    }
    const [a, b] = entry[0].split('_').map(Number)
    if (a !== viewerId && b !== viewerId) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'CHAT_NOT_PARTICIPANT', message: '채팅방 참여자가 아닙니다.' },
        { status: 403 },
      )
    }
    const partnerId = a === viewerId ? b : a
    const allMessages = mockMessagesFor(roomId, viewerId, partnerId)

    // 메시지 조회 = "이 방을 보고 있다" → 안읽음 리셋 (명세의 읽음 처리 부수효과).
    mockReadRooms.add(readKeyOf(viewerId, roomId))
    saveReadRooms()

    // 실제 백엔드(ChatMessageListResponse)는 size 미지정 시 50건 기본이지만, 프론트가
    // 항상 size=20을 보내므로(api.ts) 여기서도 20으로 고정해 실제 동작과 맞춘다.
    let page: typeof allMessages
    let hasPrevious: boolean
    let hasNext: boolean
    if (beforeParam) {
      const idx = allMessages.findIndex((m) => m.message_id === Number(beforeParam))
      const upto = idx === -1 ? allMessages.length : idx
      const start = Math.max(0, upto - 20)
      page = allMessages.slice(start, upto)
      hasPrevious = start > 0
      hasNext = true
    } else if (afterParam) {
      page = allMessages.filter((m) => m.message_id > Number(afterParam))
      hasPrevious = true
      hasNext = false
    } else {
      page = allMessages.slice(-20)
      hasPrevious = allMessages.length > 20
      hasNext = false
    }

    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: {
        messages: page,
        page_info: {
          has_previous: hasPrevious,
          has_next: hasNext,
          oldest_message_id: page[0]?.message_id ?? null,
          newest_message_id: page[page.length - 1]?.message_id ?? null,
        },
      },
    })
  }),

  // ── 피드 목록 — post_id 내림차순, cursor(마지막 post_id)보다 작은 것부터 size개 ──
  // 응답은 실서버(FeedListResponse, BE e012b8a) 모양: feeds 배열 + page_info 중첩.
  // 피드는 image_urls 대신 대표컷 1장(thumbnail_url, 카드뉴스는 첫 이미지 폴백)만 준다.
  // post_type 필터만은 실서버에 없어도 유지한다 — 카테고리 탭 개발용이고, 백엔드에
  // 필터 추가를 요청해 둔 상태(feed/api.ts getPosts 주석).
  http.get('/api/posts', async ({ request }) => {
    await delay(400)
    const url = new URL(request.url)
    const cursor = Number(url.searchParams.get('cursor')) || null
    const sizeParam = Number(url.searchParams.get('size'))
    const size = sizeParam > 0 ? Math.min(sizeParam, 50) : 10
    const postType = url.searchParams.get('post_type')

    const filtered = [...mockPosts]
      .sort((a, b) => b.post_id - a.post_id)
      .filter((post) => !postType || post.post_type === postType)
      .filter((post) => cursor === null || post.post_id < cursor)

    // 작성자는 저장된 스냅샷이 아니라 조회 시점의 최신 프로필로 채운다(실서버의 JOIN 대용).
    const feeds = filtered.slice(0, size).map((post) => ({
      post_id: post.post_id,
      post_type: post.post_type,
      author: resolveAuthor(post.author),
      content: post.content,
      // 실서버 COALESCE 폴백과 동일: 썸네일이 없으면(주로 카드뉴스) 첫 이미지가 대표컷.
      thumbnail_url: post.thumbnail_url ?? post.image_urls[0] ?? null,
      tech_stacks: post.tech_stacks,
      like_count: post.like_count,
      comment_count: post.comment_count,
      is_liked: post.is_liked,
      created_at: post.created_at,
    }))
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '피드 조회 성공',
      data: {
        feeds,
        page_info: {
          // 실계약에서 메인 피드 커서만 **불투명 문자열**이다(types.ts FeedPageInfo 주석).
          // 목이 숫자(post_id)를 내리면 목 모드에서만 통하는 계약이 되어, 커서를 문자열로
          // 다루는 코드(길이·인코딩 가정)가 실서버에서 깨져도 목에선 안 드러난다.
          next_cursor:
            feeds.length > 0 ? String(feeds[feeds.length - 1].post_id) : null,
          has_next: filtered.length > size,
        },
      },
    })
  }),

  // ── 좋아요 토글 — 목 상태를 실제로 뒤집는다 (낙관적 업데이트의 서버 확정값 역할) ──
  http.post('/api/posts/:postId/like', async ({ params }) => {
    await delay(250)
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    post.is_liked = !post.is_liked
    post.like_count += post.is_liked ? 1 : -1
    // 사용자가 쓴 글이면 바뀐 좋아요 상태도 그 자리에서 저장한다.
    // createdPosts와 mockPosts는 같은 객체를 공유하므로, 저장을 미루면 "다음 글을 쓸 때
    // 이전 글의 좋아요가 덩달아 저장되는" 예측 불가능한 시점이 된다.
    if (createdPosts.includes(post)) saveCreatedPosts()
    return HttpResponse.json({
      status: 'SUCCESS',
      message: post.is_liked ? '좋아요를 눌렀습니다.' : '좋아요를 취소했습니다.',
      data: { is_liked: post.is_liked, like_count: post.like_count },
    })
  }),

  // ── 좋아요 사용자 목록 — 오프셋 커서 (cursor = 지금까지 받은 개수) ──
  http.get('/api/posts/:postId/likes', async ({ params, request }) => {
    await delay(300)
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const url = new URL(request.url)
    const offset = Number(url.searchParams.get('cursor')) || 0
    const sizeParam = Number(url.searchParams.get('size'))
    const size = sizeParam > 0 ? Math.min(sizeParam, 50) : 20
    // 내가 눌렀으면 맨 앞에 나, 나머지는 결정적 가짜 사용자로 like_count를 채운다.
    const othersCount = Math.max(post.like_count - (post.is_liked ? 1 : 0), 0)
    const allUsers = [
      ...(post.is_liked ? [mockAuthorOf(request)] : []),
      ...Array.from({ length: othersCount }, (_, i) => likerOf(post.post_id, i)),
    ]
    const users = allUsers.slice(offset, offset + size)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '좋아요 목록 조회 성공',
      data: {
        users,
        next_cursor: offset + users.length,
        has_next: offset + users.length < allUsers.length,
      },
    })
  }),

  // ── 내가 좋아요한 게시물 — 백엔드 실물(UserLikedPostController)이 있어 그 응답
  // (CursorResponse<LikedPostResponse>, 커서 = like_id)을 그대로 재현한다.
  // 목록은 mockPosts의 is_liked에서 파생 — 피드에서 하트를 토글하면 여기도 바로 반영된다.
  // 경로의 userId는 무시한다: 목은 요청자 본인의 좋아요만 흉내낸다.
  http.get('/api/users/:userId/liked-posts', async ({ request }) => {
    await delay(350)
    const url = new URL(request.url)
    const cursor = Number(url.searchParams.get('cursor')) || null
    const sizeParam = Number(url.searchParams.get('size'))
    const size = sizeParam > 0 ? Math.min(sizeParam, 50) : 20
    // like_id는 post_id 기반 결정적 생성 — 요청 간 커서가 흔들리지 않게. 실제 정렬 기준
    // (좋아요 누른 최신순)은 목이 알 수 없어 post_id 내림차순으로 갈음한다.
    const liked = mockPosts
      .filter((post) => post.is_liked)
      .sort((a, b) => b.post_id - a.post_id)
      .map((post) => ({ post, like_id: 500_000 + post.post_id }))
    const filtered = liked.filter((entry) => cursor === null || entry.like_id < cursor)
    const page = filtered.slice(0, size)
    const items = page.map(({ post, like_id }) => {
      const author = resolveAuthor(post.author)
      return {
        like_id,
        post_id: post.post_id,
        post_type: post.post_type,
        content: post.content,
        // 카드뉴스는 첫 이미지가 대표컷 (실서버 JOIN과 동일).
        thumbnail_url: post.thumbnail_url ?? post.image_urls[0] ?? null,
        like_count: post.like_count,
        comment_count: post.comment_count,
        author_id: author.user_id,
        author_nickname: author.nickname,
        author_profile_image_url: author.profile_image_url,
        // 좋아요 누른 시각은 목에 없는 정보 — 게시 12시간 뒤로 결정적으로 지어낸다.
        liked_at: new Date(
          new Date(post.created_at).getTime() + 12 * 3_600_000,
        ).toISOString(),
        post_created_at: post.created_at,
      }
    })
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '좋아요한 게시물 조회 성공',
      data: {
        items,
        next_cursor: page.length > 0 ? page[page.length - 1].like_id : null,
        has_next: filtered.length > size,
      },
    })
  }),

  // ── 댓글 목록 — created_at 오름차순(작성순), page 기반 오프셋 페이지네이션 ──
  http.get('/api/posts/:postId/comments', async ({ params, request }) => {
    await delay(300)
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const viewerId = getViewerId(request)
    const url = new URL(request.url)
    const page = Math.max(Number(url.searchParams.get('page')) || 0, 0)
    const sizeParam = Number(url.searchParams.get('size'))
    const size = sizeParam > 0 ? Math.min(sizeParam, 50) : 5
    const all = [...commentsOf(post)].sort((a, b) => a.comment_id - b.comment_id)
    const items = all.slice(page * size, page * size + size).map((comment) => {
      const likedBy = commentLikedBy.get(comment.comment_id)
      return {
        ...comment,
        updated_at: comment.created_at,
        is_mine: comment.author.user_id === viewerId,
        like_count: likedBy?.size ?? 0,
        is_liked: viewerId !== null && (likedBy?.has(viewerId) ?? false),
      }
    })
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '댓글 조회 성공',
      data: {
        items,
        page,
        size,
        total_count: all.length,
        total_pages: size === 0 ? 0 : Math.ceil(all.length / size),
      },
    })
  }),

  // ── 게시글 상세 — 실서버(PostDetailResponse) 모양: 평평한 필드 + summary(=ai_summary) ──
  http.get('/api/posts/:postId', async ({ params }) => {
    await delay(350)
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const extras = extrasOf(post.post_id)
    const viewCount = (viewCounts.get(post.post_id) ?? 0) + 1
    viewCounts.set(post.post_id, viewCount)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '게시물 조회 성공',
      data: {
        post_id: post.post_id,
        post_type: post.post_type,
        // 실서버는 상세에서 is_following을 항상 채운다 — 목은 팔로우 정본이 없어 false 고정.
        author: { ...resolveAuthor(post.author), is_following: false },
        thumbnail_url: post.thumbnail_url,
        content: post.content,
        github_url: extras.github_url,
        deploy_url: extras.deploy_url,
        summary: extras.ai_summary,
        tech_stacks: post.tech_stacks,
        image_urls: post.image_urls,
        like_count: post.like_count,
        comment_count: post.comment_count,
        view_count: viewCount,
        is_liked: post.is_liked,
        created_at: post.created_at,
      },
    })
  }),

  // ── 댓글 작성 — 실서버처럼 생성된 id만 돌려준다(전체 객체 아님) ──
  http.post('/api/posts/:postId/comments', async ({ params, request }) => {
    await delay(300)
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const body = (await request.json()) as Partial<CommentCreateRequest> | null
    if (!body || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return HttpResponse.json(
        { status: 'FAIL', code: 'COMMON_INVALID_PARAM', message: '잘못된 요청입니다.' },
        { status: 400 },
      )
    }
    const comments = commentsOf(post)
    // 시드 대역(post_id*1000+n)보다 항상 큰 id — 작성순(오름차순) 목록의 맨 뒤에 온다.
    const maxId = comments.reduce(
      (max, comment) => Math.max(max, comment.comment_id),
      post.post_id * 1000,
    )
    const created: SeedComment = {
      comment_id: maxId + 1,
      author: mockAuthorOf(request),
      content: body.content,
      created_at: new Date().toISOString(),
    }
    comments.push(created)
    post.comment_count += 1
    // 내가 쓴 글이면 바뀐 댓글 수도 그 자리에서 저장한다 (좋아요 토글과 같은 이유).
    if (createdPosts.includes(post)) saveCreatedPosts()
    return HttpResponse.json(
      { status: 'SUCCESS', message: '댓글이 등록되었습니다.', data: { comment_id: created.comment_id } },
      { status: 201 },
    )
  }),

  // ── 댓글 좋아요 토글 ──
  http.post('/api/comments/:commentId/like', ({ params, request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const commentId = Number(params.commentId)
    const likedBy = commentLikedBy.get(commentId) ?? new Set<number>()
    const isLiked = likedBy.has(viewerId)
    if (isLiked) likedBy.delete(viewerId)
    else likedBy.add(viewerId)
    commentLikedBy.set(commentId, likedBy)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: isLiked ? '댓글 좋아요를 취소했습니다.' : '댓글에 좋아요를 눌렀습니다.',
      data: { is_liked: !isLiked, like_count: likedBy.size },
    })
  }),

  // ── 댓글 삭제 — 실서버처럼 소프트 삭제 후 목록에서 완전히 제외한다(플레이스홀더로 안 바꿈) ──
  http.delete('/api/comments/:commentId', ({ params, request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const commentId = Number(params.commentId)
    for (const [postId, comments] of commentsCache.entries()) {
      const index = comments.findIndex((c) => c.comment_id === commentId)
      if (index === -1) continue
      if (comments[index].author.user_id !== viewerId) {
        return HttpResponse.json(
          {
            status: 'ERROR',
            code: 'COMMENT_FORBIDDEN',
            message: '본인이 작성한 댓글만 삭제할 수 있습니다.',
          },
          { status: 403 },
        )
      }
      comments.splice(index, 1)
      commentLikedBy.delete(commentId)
      const post = mockPosts.find((p) => p.post_id === postId)
      if (post) {
        post.comment_count = Math.max(post.comment_count - 1, 0)
        if (createdPosts.includes(post)) saveCreatedPosts()
      }
      return HttpResponse.json({ status: 'SUCCESS', message: '댓글이 삭제되었습니다.', data: null })
    }
    return HttpResponse.json(
      { status: 'ERROR', code: 'COMMENT_NOT_FOUND', message: '댓글을 찾을 수 없습니다.' },
      { status: 404 },
    )
  }),

  // ── AI 요약 생성 — 생성 후 저장까지 한다 (다음 상세 조회부터는 ai_summary가 채워져 옴) ──
  http.post('/api/posts/:postId/ai-summary', async ({ params }) => {
    await delay(1200) // AI 생성 시간 흉내 — 버튼 로딩 상태 확인용
    const post = mockPosts.find((p) => p.post_id === Number(params.postId))
    if (!post) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'POST_NOT_FOUND', message: '게시물을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const extras = extrasOf(post.post_id)
    // 이미 있으면 그대로 돌려준다 — 재호출이 요약을 갈아치우지 않게 (멱등).
    const summary = extras.ai_summary ?? mockSummaryOf(post)
    if (!extras.ai_summary) {
      savedExtras.set(post.post_id, { ...extras, ai_summary: summary })
      saveExtras()
    }
    return HttpResponse.json({
      status: 'SUCCESS',
      message: 'AI 요약 생성 성공',
      data: { summary },
    })
  }),

  http.get('/api/github/repos', async () => {
    await delay(400)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '저장소 목록 조회 성공',
      data: { repos: MOCK_REPOS },
    })
  }),

  http.post('/api/posts/analyze', async ({ request }) => {
    await delay(700)
    const { github_url } = (await request.json()) as { github_url: string }
    // 실패 플로우 확인용 스위치: URL에 'fail'이 들어 있으면 조회 실패를 재현한다.
    if (github_url.includes('fail')) {
      return HttpResponse.json(
        {
          status: 'ERROR',
          code: 'GITHUB_REPO_NOT_FOUND',
          message: 'GitHub 저장소를 찾을 수 없습니다.',
        },
        { status: 404 },
      )
    }
    const repoName = github_url.replace(/\/+$/, '').split('/').pop() ?? ''
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '프로젝트 분석 성공',
      data: ANALYSIS_BY_REPO[repoName] ?? DEFAULT_ANALYSIS,
    })
  }),

  // ── 파일 업로드 (등록 시에만 업로드 — 시퀀스의 Orphan File 방지 흐름) ──

  http.post('/api/files', async ({ request }) => {
    await delay(400)
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) {
      return HttpResponse.json(
        { status: 'FAIL', code: 'COMMON_INVALID_PARAM', message: '파일이 없습니다.' },
        { status: 400 },
      )
    }
    const fileId = crypto.randomUUID()
    await putFile(fileId, file)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '파일 업로드 성공',
      data: { file_url: `/api/files/${fileId}` },
    })
  }),

  // 업로드한 파일을 그대로 돌려줘서 <img src>가 실제로 보이게 한다.
  http.get('/api/files/:fileId', async ({ params }) => {
    const file = await getFile(params.fileId as string)
    if (!file) return new HttpResponse(null, { status: 404 })
    return new HttpResponse(file, { headers: { 'Content-Type': file.type } })
  }),

  // ── 프로필 설정 저장 ──
  http.post('/api/profiles', async ({ request }) => {
    await delay(400)
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        {
          status: 'ERROR',
          code: 'AUTH_001',
          message: '인증 정보가 유효하지 않거나 만료되었습니다.',
        },
        { status: 401 },
      )
    }
    const body = (await request.json()) as {
      nickname?: string
      introduce?: string
      profile_image_url?: string
      interest_tag_ids?: number[]
    } | null
    // 관심 태그는 배열이 오면 통째로 교체, 안 오면 유지 — 실서버 saveInterests와 같은 규칙이다.
    // 빈 배열도 "전부 해제"라는 뜻이라 그대로 반영해야 한다.
    if (body?.interest_tag_ids) {
      mockUserInterests.set(viewerId, body.interest_tag_ids)
      saveInterests()
    }
    // 명세상 부분 갱신 — 안 보낸 필드는 기존 값을 유지한다.
    const existing = mockProfiles.get(viewerId)
    mockProfiles.set(viewerId, {
      user_id: viewerId,
      nickname: body?.nickname ?? existing?.nickname ?? null,
      introduce: body?.introduce ?? existing?.introduce ?? null,
      profile_image_url: body?.profile_image_url ?? existing?.profile_image_url ?? null,
    })
    saveProfiles()
    return HttpResponse.json(
      {
        status: 'SUCCESS',
        message: '프로필이 저장되었습니다.',
        data: { user_id: viewerId },
      },
      { status: 201 },
    )
  }),

  // ── 회원 단건 조회 — 이 목이 만든 프로필만 답하고, 나머지는 실서버로 통과 ──
  http.get('/api/users/:userId', ({ params }) => {
    const userId = Number(params.userId)
    const profile = mockProfiles.get(userId)
    if (!profile) return passthrough()
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청에 성공하였습니다.',
      data: profile,
    })
  }),

  // ── 팔로우/언팔로우 ──
  http.post('/api/users/:userId/follow', ({ request, params }) => {
    const viewerId = getViewerId(request)
    const targetId = Number(params.userId)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    if (viewerId === targetId) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'CANNOT_FOLLOW_SELF', message: '자기 자신은 팔로우할 수 없습니다.' },
        { status: 400 },
      )
    }
    followingSetOf(viewerId).add(targetId)
    saveFollowGraph()
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { is_following: true, follower_count: followerCountOf(targetId) },
    })
  }),

  http.delete('/api/users/:userId/follow', ({ request, params }) => {
    const viewerId = getViewerId(request)
    const targetId = Number(params.userId)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    followingSetOf(viewerId).delete(targetId)
    saveFollowGraph()
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { is_following: false, follower_count: followerCountOf(targetId) },
    })
  }),

  // 팔로우 상태 단건 조회 — ProfilePage의 FollowButton 초기 상태용.
  http.get('/api/users/:userId/follow', ({ request, params }) => {
    const viewerId = getViewerId(request) ?? -1
    const targetId = Number(params.userId)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청에 성공하였습니다.',
      data: {
        is_following: isFollowingMock(viewerId, targetId),
        follower_count: followerCountOf(targetId),
      },
    })
  }),

  http.get('/api/users/:userId/followers/count', ({ params }) => {
    const userId = Number(params.userId)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { follower_count: followerCountOf(userId) },
    })
  }),

  http.get('/api/users/:userId/following/count', ({ params }) => {
    const userId = Number(params.userId)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { following_count: followingSetOf(userId).size },
    })
  }),

  // 페이징(cursor)은 재현하지 않는다 — 이 목의 목적은 목록 UI(한줄소개·아바타
  // 링크·빈 상태) 확인이지 무한 스크롤 자체는 이미 실서버 명세 기준으로 검증됨.
  http.get('/api/users/:userId/following', async ({ request, params }) => {
    const userId = Number(params.userId)
    const viewerId = getViewerId(request) ?? -1
    const authHeader = request.headers.get('Authorization')
    const ids = [...followingSetOf(userId)]
    const content = await Promise.all(
      ids.map(async (id) => ({
        ...(await resolveUserSummary(id, authHeader)),
        is_following: isFollowingMock(viewerId, id),
      })),
    )
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { content, next_cursor: null, has_next: false },
    })
  }),

  http.get('/api/users/:userId/followers', async ({ request, params }) => {
    const userId = Number(params.userId)
    const viewerId = getViewerId(request) ?? -1
    const authHeader = request.headers.get('Authorization')
    const followerIds = [...mockFollowGraph.entries()]
      .filter(([, following]) => following.has(userId))
      .map(([followerId]) => followerId)
    const content = await Promise.all(
      followerIds.map(async (id) => ({
        ...(await resolveUserSummary(id, authHeader)),
        is_following: isFollowingMock(viewerId, id),
      })),
    )
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: { content, next_cursor: null, has_next: false },
    })
  }),

  // ── 프로필 하단 게시글 그리드 — 실서버(CursorResponse) 모양: items + 커서(post_id) 페이징 ──
  http.get('/api/users/:userId/posts', ({ params, request }) => {
    const userId = Number(params.userId)
    const url = new URL(request.url)
    const cursor = Number(url.searchParams.get('cursor')) || null
    const sizeParam = Number(url.searchParams.get('size'))
    const size = sizeParam > 0 ? Math.min(sizeParam, 50) : 15
    const filtered = mockPostsFor(userId).filter(
      (post) => cursor === null || post.post_id < cursor,
    )
    const items = filtered.slice(0, size)
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data: {
        items,
        next_cursor: items.length > 0 ? items[items.length - 1].post_id : null,
        has_next: filtered.length > size,
      },
    })
  }),

  /*
   * 업적 배지 — 4축 × 3티어 12종 중 **축별 최고 등급 하나씩**만 내려준다(최대 4개).
   * 실서버(be-badge BadgeService)가 조회 시점에 계산하는 규칙을 그대로 흉내낸다.
   * 활동이 없으면 빈 배열이 정상이다.
   */
  http.get('/api/users/:userId/badges', ({ params }) => {
    const userId = Number(params.userId)
    // 유저마다 다른 조합이 나오도록 id로 지표를 흔든다 — 배지 0개·1개·4개를 다 보려면
    // 서로 다른 프로필을 열어보면 된다.
    const metrics = {
      POST: (userId * 7) % 40,
      LIKE: (userId * 23) % 260,
      COMMENT: (userId * 13) % 240,
      GITHUB: (userId * 11) % 130,
    }
    const badges = MOCK_BADGE_CODES.filter((b) => metrics[b.axis] >= b.threshold)
      // 축별 최고 등급 하나만 남긴다(MOCK_BADGE_CODES가 티어 오름차순이라 뒤가 이긴다).
      .reduce<Record<string, (typeof MOCK_BADGE_CODES)[number]>>((acc, b) => {
        acc[b.axis] = b
        return acc
      }, {})
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청에 성공하였습니다.',
      data: Object.values(badges).map((b) => ({
        code: b.code,
        label: b.label,
        axis: b.axis,
        axis_label: MOCK_BADGE_AXIS_LABELS[b.axis],
        tier: b.tier,
        threshold: b.threshold,
        current_value: metrics[b.axis],
      })),
    })
  }),

  // ── 프로필 기술스택·잔디 ──
  http.get('/api/users/:userId/github', ({ params }) => {
    const userId = Number(params.userId)
    if (GITHUB_NOT_CONNECTED_USER_IDS.has(userId)) {
      return HttpResponse.json(
        {
          status: 'ERROR',
          code: 'GITHUB_NOT_CONNECTED',
          message: 'GitHub 계정이 연동되지 않았습니다.',
        },
        { status: 404 },
      )
    }
    const now = new Date()
    now.setHours(3, 0, 0, 0) // 실제 동기화 배치 시각(매일 새벽 3시)을 흉내낸다.
    const contributions = mockContributionsFor(userId)
    const totalCommits = contributions.reduce((sum, d) => sum + d.count, 0)
    const activeDays = contributions.filter((d) => d.count > 0).length
    // 비공개 커밋은 전체의 약 1/4로 잡는다 — 합이 total과 어긋나면 상단 통계가 안 맞는다.
    const privateCommits = Math.round(totalCommits * 0.24)
    const badge = mockGithubBadge(activeDays)
    const data: UserGithubResponse = {
      github_login: `mock-gh-${userId}`,
      last_synced_at: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T03:00:00`,
      from: contributions[0].date,
      to: contributions[contributions.length - 1].date,
      total_commits: totalCommits,
      public_commits: totalCommits - privateCommits,
      private_commits: privateCommits,
      active_days: activeDays,
      // 등급이 없으면 키를 아예 생략한다(non_null) — undefined를 넣으면 JSON에서 빠지므로 동일하다.
      ...(badge ? { badge } : {}),
      tech_stacks: mockTechStacksFor(userId),
      contributions,
    }
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '요청이 처리되었습니다.',
      data,
    })
  }),

  // ── 게시물 생성 ──
  // 목 모드에서는 생성까지 목으로 막는다 — 목 업로드 URL은 이 브라우저 메모리에만
  // 존재하므로, 실 DB로 게시하면 영구히 깨진 이미지 URL이 쌓이기 때문.
  // 단, 실서버가 하는 검증은 그대로 재현한다 — "목에선 되는데 붙이면 깨지는" 요청 방지.
  http.post('/api/posts', async ({ request }) => {
    await delay(400)
    const body = (await request.json()) as Partial<PostCreateRequest> | null
    // 실서버 검증과 동일: post_type·content 필수 (features/feed/types.ts 참고).
    if (
      !body ||
      (body.post_type !== 'PROJECT' && body.post_type !== 'CARD_NEWS') ||
      typeof body.content !== 'string' ||
      body.content.trim().length === 0
    ) {
      return HttpResponse.json(
        {
          status: 'FAIL',
          code: 'COMMON_INVALID_PARAM',
          message: '잘못된 요청입니다.',
        },
        { status: 400 },
      )
    }
    // 중복 태그는 실서버에서 uk_post_tags UNIQUE 위반 → 500. 같은 증상을 재현한다.
    const tags = body.tech_stacks ?? []
    if (new Set(tags).size !== tags.length) {
      return HttpResponse.json(
        {
          status: 'ERROR',
          code: 'COMMON_SERVER_ERROR',
          message: '서버 내부 오류가 발생했습니다.',
        },
        { status: 500 },
      )
    }
    nextPostId += 1
    const created: PostSummary = {
      post_id: nextPostId,
      post_type: body.post_type,
      author: mockAuthorOf(request),
      content: body.content,
      thumbnail_url: body.thumbnail_url ?? null,
      image_urls: body.image_urls ?? [],
      tech_stacks: tags,
      like_count: 0,
      comment_count: 0,
      is_liked: false,
      created_at: new Date().toISOString(),
    }
    // 피드 목 저장소에 넣는다 — 방금 게시한 글이 피드 최상단에 보이게.
    // createdPosts에도 같이 넣고 저장해야 새로고침 후에 복원된다 (같은 객체를 공유한다).
    mockPosts.unshift(created)
    createdPosts.unshift(created)
    saveCreatedPosts()
    // 상세 전용 컬럼(github_url/project_link/ai_summary)은 PostSummary에 없으므로 따로 저장한다.
    savedExtras.set(nextPostId, {
      github_url: body.github_url ?? null,
      deploy_url: body.deploy_url ?? null,
      ai_summary: body.summary ?? null,
    })
    saveExtras()
    return HttpResponse.json(
      {
        status: 'SUCCESS',
        message: '게시물이 등록되었습니다.',
        data: { post_id: nextPostId },
      },
      { status: 201 },
    )
  }),

  // ── 검색 실행 (통합/카테고리) — 명세: 인증 선택, 로그인 상태면 검색어 자동 저장 ──
  http.get('/api/search', async ({ request }) => {
    await delay(350)
    const url = new URL(request.url)
    const keyword = (url.searchParams.get('keyword') ?? '').trim()
    if (keyword.length === 0) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'EMPTY_KEYWORD', message: '검색어를 입력해주세요.' },
        { status: 400 },
      )
    }
    if (keyword.length < 2) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'KEYWORD_TOO_SHORT', message: '두 글자 이상 입력해주세요.' },
        { status: 400 },
      )
    }
    const type = (url.searchParams.get('type') ?? 'ALL') as MockSearchType
    if (!SEARCH_TYPES.includes(type)) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'INVALID_TYPE', message: '지원하지 않는 검색 타입입니다.' },
        { status: 400 },
      )
    }
    const viewerId = getViewerId(request)
    if (viewerId !== null) upsertSearchHistory(viewerId, keyword, type)

    if (type === 'ALL') {
      // 실계약(be-search 실측)은 래퍼도 has_more도 없는 **평면 배열 3개**다.
      // 예전 목은 노션 임시 명세의 `results.{users,posts,stacks}` 모양이라, 목 모드로
      // 검색하면 SearchResultsAll이 users를 undefined로 읽어 화면이 통째로 죽었다.
      // 자르지도 않는다 — 상위 3건 커트와 '더보기' 판정은 프론트가 한다(types.ts 주석).
      return HttpResponse.json({
        status: 'SUCCESS',
        message: '검색 성공',
        data: {
          users: searchUsersMock(keyword),
          posts: searchPostsMock(keyword),
          tech_stack_posts: searchStacksMock(keyword),
        },
      })
    }

    // 특정 탭 — id 내림차순 커서. 명세상 cursor는 불투명 문자열이라 목에선 마지막 id를 그대로 쓴다.
    const source =
      type === 'USER'
        ? searchUsersMock(keyword)
        : type === 'POST'
          ? searchPostsMock(keyword)
          : searchStacksMock(keyword)
    const idOf = (item: { user_id: number } | { post_id: number }) =>
      'user_id' in item ? item.user_id : item.post_id
    const cursorParam = url.searchParams.get('cursor')
    const cursorId = cursorParam ? Number(cursorParam) : null
    const limitParam = Number(url.searchParams.get('limit'))
    const limit = limitParam > 0 ? Math.min(limitParam, 50) : 20
    const filtered =
      cursorId === null ? source : source.filter((item) => idOf(item) < cursorId)
    const items = filtered.slice(0, limit)
    const hasNext = filtered.length > limit
    // 실계약은 `{ items, has_next, next_cursor }` 평면이고, next_cursor는 더 없으면
    // 키 자체가 빠진다(non_null 생략) — 앱 타입도 optional이다(SearchTabResponse).
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '검색 성공',
      data: {
        items,
        has_next: hasNext,
        ...(hasNext && items.length > 0
          ? { next_cursor: String(idOf(items[items.length - 1])) }
          : {}),
      },
    })
  }),

  // ── 최근 검색어 조회 — 인증 필수 ──
  http.get('/api/search/recent', async ({ request }) => {
    await delay(200)
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const limitParam = Number(new URL(request.url).searchParams.get('limit'))
    const limit = limitParam > 0 ? Math.min(limitParam, 20) : 10
    // 실계약은 배열 그 자체이고 필드명도 search_id / search_type이다.
    // `{ recent: [...] }`로 감싸 두던 동안은 RecentSearchList가 객체를 순회하려다
    // TypeError를 냈고, 검색바가 있는 **모든 화면**이 렌더에 실패했다.
    // 저장 구조는 그대로 두고(history_id/type) 응답 경계에서만 계약 이름으로 옮긴다.
    return HttpResponse.json({
      status: 'SUCCESS',
      message: '최근 검색어 조회 성공',
      data: (mockSearchHistory.get(viewerId) ?? []).slice(0, limit).map((h) => ({
        search_id: h.history_id,
        keyword: h.keyword,
        search_type: h.type,
        searched_at: h.searched_at,
      })),
    })
  }),

  // ── 검색 기록 삭제 (개별) — 204 No Content ──
  // 경로는 /recent다. 앱은 /api/search/recent/:id를 부르는데(features/search/api.ts,
  // 'SearchController 확인 — /history는 존재한 적 없다') 목만 /history에 걸려 있어서,
  // 목 모드에서 ✕를 누르면 핸들러를 못 만나 실서버로 bypass되고 가짜 JWT라 401 →
  // 재발급도 401 → clearAuth로 로그인 화면까지 튕겼다.
  http.delete('/api/search/recent/:searchId', ({ request, params }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    const historyId = Number(params.searchId)
    const list = mockSearchHistory.get(viewerId) ?? []
    const index = list.findIndex((h) => h.history_id === historyId)
    if (index === -1) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'HISTORY_NOT_FOUND', message: '존재하지 않는 검색기록입니다.' },
        { status: 404 },
      )
    }
    list.splice(index, 1)
    mockSearchHistory.set(viewerId, list)
    saveSearchHistoryStore()
    return new HttpResponse(null, { status: 204 })
  }),

  // ── 검색 기록 삭제 (전체) — 204 No Content ──
  http.delete('/api/search/recent', ({ request }) => {
    const viewerId = getViewerId(request)
    if (viewerId === null) {
      return HttpResponse.json(
        { status: 'ERROR', code: 'AUTH_001', message: '인증 정보가 유효하지 않거나 만료되었습니다.' },
        { status: 401 },
      )
    }
    mockSearchHistory.delete(viewerId)
    saveSearchHistoryStore()
    return new HttpResponse(null, { status: 204 })
  }),
]

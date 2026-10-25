# CLAUDE.md — Hello World 프론트엔드 AI 코딩 규칙

이 파일은 코드를 생성/수정하기 전에 **반드시 먼저 읽는다.** 아래 규칙을 어기는 코드는 생성하지 않는다.
설계 근거(기능명세서·시퀀스 다이어그램·API 명세)는 팀 Notion에서 관리한다. 규칙이 충돌하면 이 파일과 공통 API 규약서가 우선한다.

## 언어
- 항상 한국어로 답한다. 코드 주석과 설명도 한국어로 작성한다.

## 프로젝트 개요
개발자 SNS "Hello World"의 프론트엔드.
React 19 / TypeScript / Vite / react-router-dom v7 / TanStack Query v5 / Zustand / axios / @stomp/stompjs / msw(API 모킹) / oxlint.
로그인 화면의 3D 큐브에 **three**(r185)를 쓴다 — 아래 "3D 큐브" 참고.

**프론트와 백엔드는 같은 오리진으로 배포한다.** (리버스 프록시가 정적 파일과 `/api`를 함께 서빙) 개발 환경도 Vite 프록시로 같은 오리진을 유지한다.

## 명령어
```bash
npm run dev      # 개발 서버
npm run build    # tsc -b && vite build (타입 에러 시 빌드 실패)
npm run lint     # oxlint
```

## 절대 규칙 (위반 금지)

1. **Access Token은 메모리(Zustand 스토어)에만 둔다.** localStorage/sessionStorage 저장 금지. Refresh Token은 HttpOnly 쿠키라 JS로 접근할 수 없고, 접근을 시도하는 코드도 쓰지 않는다.
2. **모든 API 호출은 공통 axios 인스턴스로만 한다.** 컴포넌트에서 `axios.get(...)`/`fetch(...)` 직접 호출 금지. 공통 인스턴스에는 다음이 설정돼 있어야 한다:
   - `withCredentials: true` (같은 오리진이라 쿠키는 어차피 첨부되지만, 오리진이 갈리는 상황을 대비해 명시적으로 켜 둔다)
   - `Authorization: Bearer <accessToken>` 자동 첨부
   - 401 응답 시 재발급 → 원 요청 자동 재시도 인터셉터. **진행 중인 재발급은 공유 Promise 1개로 합친다** (동시 401 시 중복 재발급 → 강제 로그아웃 버그 방지)
3. **서버 응답 규약을 따른다.** 모든 응답은 `ApiResponse` 래퍼: 성공 `{ status: "SUCCESS", message, data }` / 에러 `{ status: "ERROR", code, message }`. JSON 필드는 **snake_case**이며, API 타입 정의도 서버 응답 그대로 snake_case로 작성한다 (`is_liked`, `like_count`, `follower_count` 등). 임의 camelCase 변환 레이어를 만들지 않는다.
4. **서버 상태는 TanStack Query, 클라이언트 전역 상태는 Zustand.** `useEffect` + `useState`로 API 데이터를 직접 관리하지 않는다. 서버 데이터를 Zustand에 복사해 두지 않는다.
5. **WebSocket 연결은 앱 전역 1개.** `@stomp/stompjs` 클라이언트를 로그인 직후 수립(CONNECT 프레임 헤더에 Access Token)하고 개인 큐(`/user/queue/...`)를 즉시 구독, 로그아웃까지 유지한다. 채팅방 topic(`/topic/room/{id}`)만 입장/퇴장에 따라 구독/해제한다. 컴포넌트나 페이지 단위로 연결을 새로 만들지 않는다.
6. **민감정보 하드코딩 금지.** API 주소 등 환경별 값은 `import.meta.env.VITE_*`로 주입한다. `.env` 파일은 커밋하지 않는다 (`.env.example`만 커밋).
7. **목 데이터는 msw로만 만들고 `src/mocks/`에 격리한다.** 애플리케이션 코드에 `if (isMock)` 같은 분기를 넣지 않는다. 워커 시작은 `import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true'` 가드 + 동적 `import()`로 감싸서 **프로덕션 번들에 절대 포함되지 않게** 한다. 핸들러 응답은 실제 서버와 똑같이 `ApiResponse` 래퍼 + snake_case로 쓴다 (규칙 3번). STOMP 실시간 구간은 msw로 모킹하지 않는다 — 아래 참고.

## 폴더 구조 (features 중심)

기능명세서 epic = `features/` 폴더 = 담당자 단위. 백엔드 도메인 패키지와 1:1로 맞춘다.

```
src/
├── api/
│   ├── client.ts              # 공통 axios 인스턴스 + 401 재발급 인터셉터 (공유 Promise)
│   └── types.ts               # ApiResponse<T>, 페이지네이션 공통 타입
├── socket/
│   ├── stompClient.ts         # 전역 STOMP 클라이언트 (연결/해제/재연결 백오프)
│   └── useSubscription.ts     # 방 topic 구독/해제 훅
├── mocks/                     # msw — 개발/테스트 전용, 프로덕션 번들 제외
│   ├── handlers.ts            # 도메인별 핸들러를 모아 export
│   └── browser.ts             # setupWorker (진입점은 main.tsx의 DEV 가드 안)
├── stores/
│   ├── useAuthStore.ts        # accessToken (메모리 보관)
│   └── useBadgeStore.ts       # DM·알림 안읽음 뱃지
├── features/                  # 도메인별 — api.ts / types.ts / hooks.ts / components/
│   ├── auth/                  #   로그인·회원가입·비밀번호 찾기
│   │   └── cube/              #     로그인 3D 큐브 엔진 (외부 반입 — 수정 금지, 아래 참고)
│   ├── feed/                  #   피드·게시글·댓글·좋아요·스크랩
│   ├── chat/                  #   대화 목록·채팅방·메시지
│   ├── profile/               #   프로필·팔로우·GitHub 연동
│   ├── notification/          #   알림 목록·실시간 토스트
│   └── search/                #   통합 검색
├── components/                # 2개 이상 feature가 쓰는 것만 (Avatar, Modal, InfiniteScroll...)
├── hooks/                     # 공용 훅 (useDebounce, useIntersectionObserver...)
├── pages/                     # 라우트 1개 = 파일 1개
└── router.tsx                 # createBrowserRouter 라우트 정의
```

배치 규칙:
- **pages는 조립, features는 구현.** 페이지 컴포넌트는 feature 컴포넌트를 배치만 하고 로직을 갖지 않는다.
- **components/ 승격은 두 번째 사용처가 생겼을 때.** 처음엔 feature 안에 만들고, 다른 feature가 실제로 필요로 할 때 올린다.
- **api/·socket/·stores/·mocks/는 공유 인프라.** 특정 feature에 넣지 않는다. 도메인별 API 함수는 해당 feature의 `api.ts`에 둔다.
- **개인 큐 메시지 핸들링은 `socket/`에 두고 각 feature가 콜백을 등록한다.** chat과 notification이 개인 큐 하나를 payload 종류로 분기해 같이 쓰기 때문.

새 기능은 해당 도메인 폴더 안에 만든다. 구조 변경이 필요하면 임의로 바꾸지 말고 팀과 합의한다.

## 3D 큐브 (로그인 화면)

로그인 좌측 브랜드 패널의 정적 SVG 일러스트를 실제 three.js 오브젝트로 교체했다.

```
features/auth/cube/                       # 엔진 — 외부 반입, 수정 금지
features/auth/components/CubeCanvas.tsx   # React 래퍼 — 조정은 여기서
```

**엔진(`cube/`)은 직접 고치지 않는다.** 이 폴더는 디자인 쪽에서 관리하는 별도 저장소에서
통째로 복사해 온 것이고, 조정은 거기서 한 뒤 다시 복사해 온다. `features/profile/meadow/`와
같은 취급이다. 여기서 고치면 다음 복사 때 통째로 날아간다.

조명·구도·재질처럼 **엔진 안을 바꿔야 하는 일**이 생기면 원본을 들고 있는 담당자(디자인,
김재성)에게 요청한다. 반대로 **화면에 앉는 방식**(크기·위치·성능·로딩)은 전부 아래
`CubeCanvas.tsx` 옵션으로 해결되므로 이 저장소 안에서 끝난다.

엔진은 React를 전혀 모르고 의존성이 `three` 하나뿐이다. 텍스처와 환경광까지 전부 런타임에
생성해서 `public/`에 넣을 에셋이 0개다. 조정 가능한 옵션과 그 값을 그렇게 잡은 이유는
`cube/README.md`에 있다.

**화면에서 보이는 것을 바꾸려면 `CubeCanvas.tsx`의 옵션을 만진다.** 크기(`zoom`),
구도(`composition`), 접지 그림자(`shadow`), 가로/세로 구도(`framing`), 글로우(`postfx`),
성능 등급(`tier`)이 전부 옵션이다. 값마다 왜 그 값인지가 주석에 적혀 있으니 바꾸기 전에
읽는다.

깨뜨리면 안 되는 것 세 가지:

1. **`lazy()` 경계를 없애지 않는다.** `three`가 엔진을 통해 딸려 들어오는데, 정적 import로
   바꾸면 진입 청크에 합쳐져서 **모든 라우트가** 받는다. 실측: 진입 청크 789 kB(gzip 236) →
   1,373 kB(gzip 390). `BrandPanel`이 `lazy(() => import('./CubeCanvas'))`로 끊어 둔 이유가
   이것이고, `Suspense` fallback은 같은 클래스의 빈 div여야 로딩 중 레이아웃이 안 흔들린다.
2. **캔버스는 `useEffect` 안에서 만든다.** JSX에 `<canvas ref>`로 두면 StrictMode의 이중
   실행과 async 생성이 겹쳐서 `forceContextLoss()`가 그 엘리먼트를 죽이고, 큐브가 아예
   안 그려진다(콘솔에 `THREE.WebGLRenderer: Context Lost.`, 화면엔 빈 캔버스).
3. **화면 밖으로 나가면 `stop()`한다.** rAF는 탭이 숨겨질 때만 멈춘다. 모바일에서는 큐브가
   폼 아래에 있어서, 이걸 빼면 사용자가 입력하는 내내 보이지도 않는 것을 계속 그린다.
   `IntersectionObserver`로 물려 뒀다.

## 확정된 UX 패턴 (명세 기준)

- **낙관적 업데이트**: 좋아요/팔로우 토글, 댓글 작성, 채팅 메시지 전송은 응답 전 UI 즉시 반영, 실패 시 롤백(+재전송 옵션). TanStack Query의 `onMutate`/`onError` 롤백 패턴 사용.
- **무한 스크롤 페이지 크기**: 피드 10 / 댓글 5 / 채팅 메시지·채팅방 목록·팔로워 목록 20. `useInfiniteQuery` 사용.
- **채팅 재연결**: 지수 백오프(1s→2s→4s...) 최대 5회. 재연결 성공 시 재구독 + 마지막 수신 메시지 ID 이후를 REST로 갭 복구. 5회 실패 시 "연결에 실패했습니다. 새로고침 해주세요" 안내.
- **뱃지 동기화**: DM·알림 뱃지는 개인 큐 push로 증가, 방 입장/읽음 처리 시 로컬 상태 갱신으로 감소.

## API 모킹 (msw)

백엔드 구현을 기다리지 않고 화면을 만들기 위해 msw를 쓴다. 네트워크 레벨에서 가로채므로 `api/client.ts`의 인터셉터(401 재발급, `Authorization` 헤더)가 **그대로 실행된다** — 앱 코드는 서버가 진짜인지 모른다.

- **적용 범위는 REST 구간까지.** 피드·프로필·검색·인증 등. 핸들러는 `src/mocks/handlers.ts`에 도메인별로 나눠 작성한다.
- **STOMP는 msw로 모킹하지 않는다.** msw의 `ws.link()`는 raw WebSocket 프레임 단위라 STOMP의 CONNECT/CONNECTED 핸드셰이크·SUBSCRIBE id·heart-beat를 직접 구현해야 한다. 채팅·알림은 백엔드 dev 서버의 실제 브로커에 붙어서 개발한다.
- **켜고 끄기**: `.env.local`에 `VITE_USE_MOCK=true`. 기본값은 꺼짐(실서버 연동).
- **정의하지 않은 요청은 통과시킨다**: `worker.start({ onUnhandledRequest: 'bypass' })`. 일부만 목으로 돌리고 나머지는 실서버에 붙일 수 있다.
- `public/mockServiceWorker.js`는 msw가 생성한 파일이다. **직접 수정하지 말고 커밋은 한다** (없으면 워커 등록 실패). 갱신은 `npx msw init public/ --save`.
- 목 응답이 실제 명세와 어긋나면 "목에선 되는데 붙이면 깨지는" 상황이 생긴다. API 명세가 바뀌면 핸들러도 같이 고친다.

## 네이밍
- 컴포넌트 PascalCase (`PostCard.tsx`) / 훅 `use~` camelCase / 상수 UPPER_SNAKE.
- API 함수: HTTP 동사 기반 (`getPosts`, `createPost`, `toggleLike`).
- Zustand 스토어: `use~Store` (`useAuthStore`).
- 타입: 요청 `~Request` / 응답 `~Response`.

## 코드 생성 시 체크리스트 (스스로 확인)
- [ ] 토큰을 localStorage에 넣지 않았는가
- [ ] 공통 axios 인스턴스를 썼는가 (직접 fetch/axios 호출 없는가)
- [ ] API 타입이 snake_case + ApiResponse 래퍼 기준인가
- [ ] 서버 데이터를 TanStack Query로 관리하는가 (useEffect fetch 없는가)
- [ ] WebSocket 연결을 새로 만들지 않고 전역 클라이언트를 썼는가
- [ ] 목 데이터가 `src/mocks/` 밖으로 새어 나가지 않았는가 (앱 코드에 mock 분기 없는가)
- [ ] 새 코드가 올바른 도메인 폴더에 있는가
- [ ] 한 화면에서만 쓰는 무거운 라이브러리를 정적 import로 넣지 않았는가 (진입 청크에 합쳐진다)

## 확실하지 않을 때
스택·구조·규약이 모호하면 임의로 정하지 말고 사람에게 묻는다. 특히 새 라이브러리 추가, 라우트 URL 설계, 공통 컴포넌트/스토어 구조 변경은 확인받는다.

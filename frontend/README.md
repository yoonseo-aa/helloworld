# Hello World Frontend

개발자 SNS "Hello World" 프론트엔드.
React 19 · TypeScript · Vite · react-router-dom v7 · TanStack Query v5 · Zustand · axios · @stomp/stompjs · three(로그인 3D 큐브)

---

## 개발 시작 전 읽기

**Node만 있으면 바로 실행됩니다.**

### 0. 사전 준비물
- **Node.js 22 LTS** (Vite 8 최소 요구: 20.19+ / 22.12+ — `node -v`로 확인)
- API 연동 기능을 개발할 때는 **백엔드 로컬 서버**(http://localhost:8080)가 떠 있어야 합니다 → [`../backend/README.md`](../backend/README.md) 순서대로 세팅

### 1. 설치 · 실행

```bash
cd frontend
npm install
npm run dev        # 개발 서버 (http://localhost:3000)
```

> **포트는 3000 고정입니다** (`vite.config.ts`의 `strictPort: true`). 백엔드 CORS 허용
> 오리진과 맞춰둔 값이라, 이미 3000을 쓰는 프로세스가 있으면 다른 포트로 옮겨가지 않고
> **일부러 실패합니다.** `docker compose`로 프론트 컨테이너를 띄워둔 상태면 그게 3000을
> 잡고 있으니 `docker compose stop frontend`로 내리고 실행하세요.

기타 명령어:

```bash
npm run build      # tsc -b && vite build — 타입 에러가 있으면 빌드 실패
npm run lint       # oxlint
npm run preview    # 빌드 결과물 로컬 확인
```

### 2. 환경변수

양식은 `.env.example`에 있습니다. 필요한 값을 `.env.local`에 복사해 채우세요.

| 변수 | 용도 |
|---|---|
| `VITE_USE_MOCK` | `true`면 msw로 API를 가로챕니다(아래 3번). 기본값 `false` |
| `VITE_GOOGLE_CLIENT_ID` | 구글 로그인. Client Secret은 백엔드만 보유합니다 |

- **API 주소는 환경변수가 아닙니다.** 모든 호출은 상대경로(`/api/...`)로 하고, dev에서는
  Vite 프록시가 `:8080`으로 넘깁니다. 배포에서도 리버스 프록시가 같은 오리진으로 서빙하므로
  절대 URL을 쓰면 이 구조를 우회하게 됩니다.
- **`.env*` 파일은 커밋하지 않습니다** (`.env.example`만 커밋).
- 코드에서는 `import.meta.env.VITE_*`로만 읽습니다.

### 3. API 모킹 (msw)

백엔드에 아직 없는 API를 앞질러 개발할 때 씁니다. `.env.local`에 `VITE_USE_MOCK=true`를
넣고 **dev 서버를 재시작**하세요 (환경변수는 HMR로 반영되지 않습니다).

- 핸들러는 `src/mocks/handlers.ts`. 정의되지 않은 요청은 실서버로 통과(bypass)하므로
  일부만 목으로 돌리고 나머지는 실 백엔드에 붙일 수 있습니다.
- 프로덕션 빌드에는 포함되지 않습니다(`main.tsx`의 DEV 가드 + 동적 import).
- **목 응답은 실제 명세와 어긋나지 않게 유지하세요.** 어긋나면 "목에선 되는데 붙이면
  깨지는" 상황이 생깁니다. API 명세가 바뀌면 핸들러도 같이 고칩니다.

### 4. 디자인 시안 (`handoff/`)

**이 폴더는 레포에 없습니다** (`.gitignore` 처리). 산출물이 아니라 참고 자료이고,
`field-defs.ts` 하나가 219KB라 `src/`에 들어간 사본과 중복되기 때문입니다.

**코드 주석 여러 곳이 이 경로를 참조합니다** — 예를 들어
`features/profile/components/MeadowSection.tsx`는 `handoff/src/features/profile/meadow/*`를
근거로 듭니다. 시안을 대조해야 하면 팀에서 공유한 **`front.zip`을 `frontend/handoff/`에
풀어두세요.** 그러면 주석의 경로가 그대로 맞습니다.

시안 폴더 안에 참고 문서가 함께 있습니다: `screens.md`(화면→라우트),
`components.md`(수치 명세), `handoff-notes.md`(합의·미결 사항), `tokens.css`(디자인 토큰).

> `features/profile/meadow/`의 세 파일(`field-defs.ts` · `model.ts` · `engine.ts`)은
> **수정 금지**입니다. 시드 난수 호출 순서와 애니메이션 상수가 시안과 어긋나면 결과가
> 달라집니다. 시안 원본과 바이트 단위로 동일하게 유지하세요.

### 5. 3D 큐브 (`features/auth/cube/`)

로그인 좌측의 큐브는 three.js 오브젝트이고, 엔진 폴더(`cube/`)는 **디자인 쪽에서 관리하는
별도 저장소에서 통째로 복사해 온 것**입니다. meadow와 같은 성격이라 **여기서 직접 고치지
마세요** — 원본에서 조정한 뒤 다시 복사해 옵니다. 여기서 고치면 다음 복사 때 날아갑니다.

엔진 안(조명·구도·재질)을 바꿔야 하면 원본 담당자(디자인, 김재성)에게 요청하세요.
화면에 앉는 방식(크기·위치·성능·로딩)은 `CubeCanvas.tsx` 옵션으로 이 저장소 안에서
해결됩니다.

- 화면에 보이는 것(크기·구도·그림자·글로우)은 `features/auth/components/CubeCanvas.tsx`의
  옵션으로 조정합니다. 값마다 근거가 주석에 있습니다.
- 옵션 전체 목록과 함정(왜 `lazy()`로 끊었는지, 왜 캔버스를 이펙트 안에서 만드는지)은
  `features/auth/cube/README.md`에 있습니다.
- 에셋은 0개입니다. 텍스처와 환경광까지 런타임에 생성하므로 `public/`에 넣을 것이 없습니다.

### 6. 🔴 코드 작성 전 필독 문서
- 이 폴더의 **`CLAUDE.md`** — AI/사람 공통 필수 규칙 (토큰 저장 위치, axios 인스턴스, 전역 WebSocket, 폴더 구조). AI 코딩 툴을 쓸 때도 이 파일을 먼저 읽게 하세요.
- 팀 노션의 **기능명세서 · 시퀀스 다이어그램 · API 명세** — 화면 동작과 API 규약의 정본

---

## 프로젝트 구조 (features 중심)

```
src/
├── api/            # 공통 axios 인스턴스(client.ts) + 공통 타입
├── socket/         # 전역 STOMP 클라이언트, 구독 관리
├── stores/         # Zustand (accessToken, 뱃지 등 클라이언트 전역 상태)
├── features/       # 도메인별 구현 — auth / feed / chat / profile / notification / search
│   ├── auth/cube/       # 로그인 3D 큐브 엔진 (외부 반입 — 위 5번)
│   └── profile/meadow/  # 프로필 초원 엔진 (외부 반입 — 위 4번)
├── components/     # 2개 이상 feature가 쓰는 공용 컴포넌트
├── hooks/          # 공용 훅
├── pages/          # 라우트 단위 페이지 (조립만 담당)
└── router.tsx
```

상세 배치 규칙은 `CLAUDE.md`의 "폴더 구조" 참고. **새 기능은 담당 도메인의 `features/` 폴더 안에서 작업하세요.**

---

## 핵심 개발 규칙 (요약)

- Access Token은 **메모리(Zustand)에만** — localStorage 금지
- API 호출은 **공통 axios 인스턴스만** (401 재발급 인터셉터 포함)
- 서버 상태는 TanStack Query / 클라이언트 상태는 Zustand
- WebSocket 연결은 **앱 전역 1개** — 방 topic 구독만 입퇴장에 따라 변경
- 서버 JSON은 snake_case + `ApiResponse` 래퍼 그대로 타입 정의

---

## 브랜치 / 커밋 규칙

- 브랜치: `master`(배포) / `develop`(통합) / `feature/{도메인}-{기능}` (예: `feature/auth-login`)
- 커밋: `타입: 내용` (타입 = feat/fix/refactor/docs/test/chore)
  - 예: `feat: 로그인 폼 및 토큰 재발급 인터셉터 구현`
- PR은 `develop`으로, 최소 1인 리뷰 후 머지

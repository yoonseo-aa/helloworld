# Hello World — 아키텍처

개발자를 위한 SNS. GitHub 프로젝트를 공유하고, 잔디·기술스택으로 서로를 파악하며,
게시물·댓글·DM으로 소통한다.

---

## 1. 배포 구성

단일 EC2 인스턴스 위에 컨테이너로 올린다. nginx만 호스트에 직접 설치돼 있다.

```
                    인터넷
                      │  443 (HTTPS, Let's Encrypt)
                      ▼
        ┌─────────────────────────────┐
        │   nginx (호스트 설치)         │   i15e204.p.ssafy.io
        │   TLS 종료 · 경로 라우팅        │
        └──┬────────┬────────┬────────┘
           │        │        │
    /      │  /api/ │  /ws   │ /files/
           ▼        ▼        ▼        ▼
      ┌────────┐ ┌──────────────┐ ┌────────┐
      │frontend│ │   backend    │ │ MinIO  │
      │ :3000  │ │    :8080     │ │ :9000  │
      │ (nginx)│ │ (Spring Boot)│ │        │
      └────────┘ └──┬───┬───┬───┘ └────────┘
                    │   │   │
          ┌─────────┘   │   └─────────┐
          ▼             ▼             ▼
     ┌────────┐   ┌─────────┐   ┌──────────┐
     │ MySQL  │   │  Redis  │   │ElasticMQ │
     │ :3306  │   │  :6379  │   │  :9324   │
     └────────┘   └─────────┘   └──────────┘
                                (내부 전용)
```

### 왜 이렇게 나눴나

**nginx를 호스트에 두는 이유** — 컨테이너로 올리면 인증서 갱신(Certbot)과 포트 바인딩이
얽힌다. 설정 변경은 서버당 한 번이고 배포마다 반복할 일이 아니라서, 배포 파이프라인에서
분리했다. 설정 오타 하나로 배포가 서비스를 죽이는 상황도 막는다.

**MinIO·Redis·MySQL 포트를 외부에 열지 않는다** — MinIO는 `127.0.0.1` 에만 바인딩하고,
이미지는 nginx의 `/files/` 경로로 프록시한다. 브라우저에 `:9000` 을 직접 내려주면
HTTPS가 아니라 혼합 콘텐츠로 차단되고, 포트가 열려 있다는 사실도 노출된다.

**ElasticMQ는 호스트 포트를 열지 않는다** — 백엔드만 쓰는 내부 브로커다.

---

## 2. 컨테이너 구성 (Docker)

앱과 인프라를 **모두 컨테이너로** 돌린다. nginx만 호스트에 있다.

| 컨테이너 | 이미지 | 포트 | 볼륨 |
|---|---|---|---|
| `helloworld-backend` | 직접 빌드 (멀티스테이지) | `8080:8080` | — |
| `helloworld-frontend` | 직접 빌드 (멀티스테이지) | `127.0.0.1:3000:80` | — |
| `helloworld-mysql` | `mysql:8.0` | `3306:3306` | `mysql_data` |
| `helloworld-redis` | `redis:7-alpine` | `6379:6379` | `redis_data` |
| `minio` | `minio/minio` | `127.0.0.1:9000·9001` | `minio_data` |
| `helloworld-elasticmq` | `softwaremill/elasticmq-native` | (미공개) | — |

### 이미지 빌드 — 멀티스테이지

둘 다 **빌드 도구를 최종 이미지에 남기지 않는다.**

```
backend                          frontend
┌──────────────────────────┐     ┌──────────────────────────┐
│ maven:3.9-temurin-17     │     │ node:20-alpine           │
│  pom.xml 먼저 복사        │     │  package*.json 먼저 복사  │
│  → 의존성 캐시 레이어      │     │  → npm ci 캐시 레이어     │
│  mvn package             │     │  npm run build           │
└───────────┬──────────────┘     └───────────┬──────────────┘
            │ app.jar 만 복사                 │ dist/ 만 복사
            ▼                                ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│ eclipse-temurin:17-jre   │     │ nginx:alpine             │
│  JDK 없이 JRE만           │     │  정적 파일 서빙            │
└──────────────────────────┘     └──────────────────────────┘
```

**의존성 파일을 소스보다 먼저 복사하는 이유** — 도커는 레이어 단위로 캐시한다.
소스만 바뀌면 `mvn dependency:go-offline` / `npm ci` 레이어를 재사용해 빌드가 훨씬 빠르다.
소스와 함께 복사하면 코드 한 줄만 고쳐도 의존성을 전부 다시 받는다.

**프론트는 빌드 결과가 정적 파일이라 nginx로 서빙한다.** 컨테이너 안에도 nginx가 있고
호스트에도 nginx가 있는 2단 구조인데, 호스트 쪽은 TLS 종료와 경로 분배를 맡고
컨테이너 쪽은 SPA 라우팅(모든 경로를 `index.html` 로)을 맡는다.

### 기동 순서 — healthcheck

```
mysql(healthy) ─┐
redis(healthy) ─┼─► backend ─► frontend
elasticmq(healthy)┤
minio(started) ─┘
```

`depends_on` 에 `condition: service_healthy` 를 걸어 **실제로 준비된 뒤에** 백엔드가 뜬다.
단순히 컨테이너가 시작된 것과 DB가 연결을 받을 수 있는 것은 다르다 —
MySQL은 `mysqladmin ping`, Redis는 `redis-cli ping`, ElasticMQ는 `nc -z localhost 9324` 로 확인한다.

ElasticMQ에 TCP 체크를 쓰는 이유는 SQS 쿼리 API라 HTTP GET으로는 판정할 수 없어서다.

### 볼륨 — 재생성해도 데이터가 남는다

`docker compose up --build` 로 컨테이너를 다시 만들어도 named volume은 유지된다.
Redis가 **좋아요·팔로우의 정본**이라 이게 중요하다 — 볼륨이 없으면 재배포마다 카운트가 0이 된다.

MySQL 볼륨에는 함정이 하나 있다. `schema.sql` 은 `/docker-entrypoint-initdb.d/` 에 마운트돼
**볼륨이 비어 있을 때만** 실행된다. 그래서 기존 DB에는 스키마 변경이 자동 반영되지 않고,
`migration/NNN_*.sql` 을 손으로 돌려야 한다.

### Jenkins는 별도 compose

`docker-compose.jenkins.yml` 로 분리했다. 앱을 재배포할 때 `docker compose up -d` 가
Jenkins까지 건드리면 **배포 도중 배포 도구가 죽는다.**

`network_mode: host` 를 쓰는데, 파이프라인이 배포 단계에서 SSH로 자기 자신(EC2)에 접속해
docker 명령을 실행하기 때문이다. 호스트 네트워크여야 컨테이너 안에서 `localhost` 의 sshd에 닿는다.

### 로컬 개발에서는

인프라만 컨테이너로 띄우고 앱은 IDE에서 직접 실행하는 게 보통이다.

```bash
docker compose up -d mysql redis      # 필요하면 minio, elasticmq
```

이때 루트 `.env` 는 **읽히지 않는다.** `.env` 는 docker compose가 컨테이너에
환경변수를 주입할 때 쓰는 파일이고, IDE 실행은 `application-local.yml` 을 본다.
이 둘을 혼동해 "키를 넣었는데 안 잡힌다"가 자주 발생한다.

---

## 3. 요청 흐름

```
브라우저
  │
  │ ① 로그인 → JWT(access) 발급, refresh 는 HttpOnly 쿠키
  ▼
nginx ── /api/ ──► Spring Boot
                     │
                     ├─ SecurityFilterChain
                     │    └ JwtAuthenticationFilter  → SecurityContext 에 userId
                     │
                     ├─ Controller  (@LoginUserId 로 userId 주입)
                     │      │  요청/응답 DTO, @Valid 검증
                     │      ▼
                     ├─ Service     (@Transactional 경계)
                     │      │  여러 Mapper 호출 조율, 외부 API 호출
                     │      ▼
                     └─ Mapper      (MyBatis, XML에 SQL)
                            ▼
                          MySQL
```

**계층 규약**

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| Controller | HTTP 요청/응답, 검증 트리거 | 비즈니스 판단, 트랜잭션 |
| Service | 트랜잭션 경계, 도메인 규칙, 외부 호출 | SQL |
| Mapper | SQL 실행 | 조건 분기, 가공 |

Service끼리는 호출한다(예: `PostService` → `UserService.ensureExists`).
Controller가 다른 Controller를 부르지는 않는다.

**응답은 전부 `ApiResponse` 로 감싼다.**

```json
{ "status": "SUCCESS", "message": "...", "data": { ... } }
{ "status": "ERROR", "code": "POST_NOT_FOUND", "message": "..." }
```

`NON_NULL` 직렬화라 성공 시 `code`, 실패 시 `data` 는 응답에서 빠진다.

---

## 4. 백엔드 구조

```
com.helloworld
├── domain/                  기능 단위. 각각 controller·service·mapper·dto·entity
│   ├── auth                 로그인·JWT·소셜 로그인(구글)
│   ├── user                 회원·프로필
│   ├── post                 게시물·피드
│   │   └── summary          ← GitHub README AI 요약 (하위 패키지)
│   ├── comment              댓글·대댓글
│   ├── like                 게시물/댓글 좋아요
│   ├── follow               팔로우
│   ├── chat                 실시간 DM
│   ├── notification         알림
│   ├── search               통합 검색
│   ├── tag                  기술스택 태그
│   └── file                 이미지 업로드(MinIO)
└── global/
    ├── config               Security · Redis · WebSocket · Swagger · Async · MinIO
    ├── security             JWT 필터·토큰 발급·@LoginUserId 리졸버·STOMP 인증
    ├── exception            ErrorCode + 전역 핸들러
    ├── common               ApiResponse · CursorResponse · PageSize
    └── mybatis              타입 핸들러 등
```

**도메인 안에 하위 도메인을 두는 경우** — `post.summary` 처럼 특정 도메인에 종속적이면서
클라이언트·서비스·DTO를 온전히 갖는 기능은 하위 패키지로 둔다. 최상위로 올리면
"post 없이 존재할 수 있는 것"처럼 보인다.

---

## 5. 데이터 저장소 3종과 역할 분담

이 프로젝트의 특징적인 부분이다. **저장소마다 정본(source of truth)이 다르다.**

```
MySQL     ─ 회원·게시물·댓글·DM 등 영속 데이터 (18개 테이블)
Redis     ─ 좋아요·팔로우 카운트/관계의 정본, refresh 토큰, 단기 캐시
MinIO     ─ 이미지 파일
```

### MySQL — 영속 데이터

```
users ─┬─ posts ─┬─ post_medias
       │         ├─ post_tags ── tags
       │         ├─ post_likes
       │         ├─ post_bookmarks
       │         └─ comments ── comment_likes
       ├─ follows
       ├─ user_interests / user_badges / tech_stack_cards
       ├─ search_histories
       ├─ notifications
       └─ dm_rooms ── dm_messages / dm_members
```

스키마 변경은 `schema.sql` 수정 + `migration/NNN_*.sql` 추가가 한 쌍이다.
`schema.sql` 은 **DB를 처음 만들 때만** 실행되므로, 기존 DB에는 마이그레이션을 따로 돌려야 한다.

### Redis — 좋아요·팔로우의 정본

**왜 RDB가 아닌가** — 좋아요는 토글이 잦고 카운트를 매번 세면 `COUNT(*)` 가 쌓인다.
Redis의 Set(누가 눌렀는지) + 카운터를 정본으로 두고, RDB는 백업·목록 조회용으로 둔다.

토글은 **Lua 스크립트**로 원자적으로 처리한다(`scripts/toggle_like.lua`). 조회와 갱신을
따로 하면 그 사이 다른 요청이 끼어들어 카운트가 어긋난다.

AOF 지속화(`appendfsync everysec`)를 켜서 재시작에도 정본이 살아남는다.

### MinIO — 이미지

업로드는 백엔드를 거치지만, **조회는 nginx가 MinIO로 직접 프록시**한다(`/files/`).
피드에서 이미지 수십 개를 받아도 백엔드에 부하가 없고, 캐시도 nginx가 처리한다.

---

## 6. 비동기 처리 (SQS / ElasticMQ)

좋아요·팔로우는 Redis에 즉시 반영하고, **RDB 반영은 큐로 미룬다.**

```
좋아요 토글 요청
   │
   ├─► Redis (정본) 즉시 갱신 ──► 응답
   │
   └─► SQS 발행 ──► Worker ──► RDB 반영 (백업)
```

**스위치가 도메인별로 분리돼 있다** — `app.sqs.post-like.enabled` 를 끄면 그 도메인만
동기 폴백으로 돌아간다. 공유하면 한 도메인 설정 변경이 다른 도메인을 죽인다(실제 사고 사례).

**큐가 없으면 앱이 기동하지 않는다.** SQS 리스너 컨테이너가 기동 시점에 큐를 해석하기
때문이다. 그래서 `elasticmq.conf` 에 큐를 정적 선언해 브로커 재시작에도 살아남게 했고,
DLQ(`*-dlq`)로 poison 메시지를 격리한다.

---

## 7. 실시간 (WebSocket / STOMP)

```
브라우저 ──── /ws (SockJS) ────► Spring
                                  │
                    StompAuthChannelInterceptor
                      CONNECT 시 JWT 검증 → Principal 부여
                                  │
                          SimpleBroker (인메모리)
                            /topic  — 브로드캐스트
                            /queue  — 개인 수신
```

DM과 알림에 쓴다. 브로커가 인메모리라 서버를 여러 대로 늘리면 메시지가 갈라진다 —
그때는 외부 브로커(Redis Pub/Sub·RabbitMQ)로 바꿔야 한다.

---

## 8. 외부 연동

| 대상 | 용도 | 인증 |
|---|---|---|
| Google OAuth | 소셜 로그인 | client id/secret |
| GitHub REST | 저장소 목록·README·언어 통계 | 서버 PAT (없으면 익명 60회/시간) |
| GitHub GraphQL | 잔디(일별 커밋), 기술스택 | 사용자별 OAuth 토큰 (AES-GCM 암호화 저장) |
| OpenAI (SSAFY GMS) | README → 구조화 요약 | GMS 키 |

**GMS 프록시** — OpenAI 공식 주소가 아니라 `gms.ssafy.io/gmsapi/api.openai.com/v1` 를
거쳐야 크레딧이 차감된다. 파라미터·응답 형식은 공식 문서와 같다.

### AI 요약 흐름

```
작성 폼에서 저장소 선택
   │
   ├─► GET  /api/github/repos            프로필의 github_username 으로 공개 저장소 목록
   │
   └─► POST /api/posts/ai-summary/preview
          │
          ├─ GitHub: README + 언어 통계
          ├─ 200자 미만이면 여기서 중단 (요약 만들지 않음)
          ├─ GMS: Structured Outputs 로 JSON 강제
          └─ Redis 캐시에 1시간 보관 ──┐
                                       │
       게시물 작성 (POST /api/posts) ◄─┘
          └─ 서버가 캐시에서 꺼내 posts.ai_summary 에 JSON 저장
```

**프론트가 요약을 되돌려보내지 않는다.** 사용자가 고칠 수 없는 값이라 왕복시킬 이유가
없고, 그 과정에서 조작 가능성만 생긴다.

---

## 9. 인증

```
로그인
  ├─ access token  (JWT, 30분)  → 응답 본문. 프론트가 메모리 보관
  └─ refresh token (14일)       → HttpOnly 쿠키 + Redis 저장
```

**refresh를 Redis에 두는 이유** — 로그아웃·강제 만료를 서버가 통제할 수 있어야 한다.
JWT만으로는 발급된 토큰을 취소할 방법이 없다.

쿠키 속성은 환경별로 다르다 — 배포는 `Secure=true; SameSite=None`, 로컬은 http라
`Secure=false; SameSite=Lax` 로 덮어쓴다. 안 그러면 브라우저가 쿠키를 저장하지 않는다.

---

## 10. CI/CD

```
GitLab (develop push)
   │  webhook
   ▼
Jenkins (EC2 위 컨테이너, 9090)
   ├─ Checkout
   └─ Deploy to EC2
        └─ SSH → git pull → docker compose up -d --build
   │
   └─► Mattermost 알림 (성공/실패)
```

Jenkins는 앱 스택과 **별도 compose 파일**로 관리한다(`docker-compose.jenkins.yml`).
앱을 재배포해도 Jenkins가 함께 죽지 않아야 하기 때문이다.

`network_mode: host` 를 쓰는 이유는 파이프라인이 배포 단계에서 SSH로 **자기 자신**에
접속해 docker 명령을 실행하기 때문이다.

---

## 11. 프론트엔드

```
React 19 + TypeScript + Vite
├── react-router-dom      라우팅
├── @tanstack/react-query 서버 상태 (캐시·재검증)
├── zustand               클라이언트 상태 (토스트 등)
├── axios                 HTTP (인터셉터에서 토큰 주입·401 재발급)
├── @stomp/stompjs        WebSocket
├── tailwindcss           스타일
└── msw                   백엔드 미구현 API 목킹
```

구조는 `features/` 기준이다 — `feed`, `profile`, `chat` 처럼 화면 단위로
`api.ts` · `hooks.ts` · `types.ts` · `components/` 를 함께 둔다.

**dev 서버는 3000 고정**(`strictPort: true`)이고 `/api` 를 8080으로 프록시한다.
포트가 밀리면 CORS가 깨지므로, 옮겨가지 말고 실패하게 해서 원인이 바로 보이게 했다.

---

## 12. 설계에서 반복되는 원칙

**정본을 하나로 정한다** — 좋아요는 Redis, 게시물은 MySQL. 두 곳에 쓰되 "어느 쪽이
진실인가"를 명시하고, 나머지는 백업·캐시로 다룬다.

**외부 호출을 트랜잭션 밖에 둔다** — GitHub·OpenAI 응답을 기다리는 동안 DB 커넥션을
잡고 있으면, 외부가 느린 것만으로 무관한 API까지 함께 느려진다.

**실패를 오류로 다룰지 상태로 다룰지 구분한다** — README가 없는 저장소는 오류가 아니라
정상적인 상태다. 404를 주면 프론트가 오류 분기를 만들어야 하는데, 그건 잘못된 모델링이다.

**설정 실수는 기동 시점에 터뜨린다** — 잘못된 값이 런타임에야 드러나면 사용자가 버튼을
누를 때 발견된다. 상한값 검증을 static 블록에 두는 식으로 앞당긴다.

# Hello World Backend

개발자 SNS "Hello World" 백엔드.
Java 17 · Spring Boot 3 · Maven · MyBatis · MySQL · Redis · AWS SQS · JWT

---

## ⚠️ 개발 시작 전 반드시 읽기 (필독)

**clone 받고 아래 순서대로 따라 하세요. 순서를 건너뛰면 실행이 안 됩니다.**

### 0. 사전 준비물 (로컬에 설치·실행되어 있어야 함)
- JDK 17
- MySQL 8.x  (실행 중이어야 함)
- Redis  (실행 중이어야 함)
- IntelliJ IDEA (권장)

### 1. 저장소 clone 후 IntelliJ로 열기
- `File > Open` → 프로젝트 루트의 `pom.xml` 선택 → "Open as Project"
- Maven 의존성 자동 다운로드 대기

### 2. 🔴 환경설정 파일 만들기 (가장 중요 — 안 하면 실행 불가)
- 이 프로젝트는 **개인 설정 파일을 각자 만들어서** 씁니다. 공용 파일을 직접 수정하지 않습니다.
- `src/main/resources/application-local.yml.example` **파일을 복사**해서
  같은 위치에 `application-local.yml` 이라는 이름으로 만드세요.
- 새로 만든 `application-local.yml` 안의 값(DB 비밀번호, Redis, JWT secret 등)을 **본인 로컬 환경에 맞게** 채웁니다.

> **절대 하지 말 것**
> - `.example` 파일을 직접 수정해서 쓰지 마세요. 그건 "양식(템플릿)"입니다.
> - `application-local.yml`, `.env` 등 **개인 설정 파일은 절대 커밋하지 마세요.** (`.gitignore`에 이미 막혀 있으니 강제로 add 하지 말 것)
> - DB 비밀번호·JWT secret·AWS 키 같은 민감정보를 코드나 공용 yml에 넣지 마세요.

### 3. 데이터베이스 준비
- MySQL에 접속해 데이터베이스를 생성합니다.
  ```sql
  CREATE DATABASE helloworld CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```
- 테이블 생성: `src/main/resources/schema.sql` 을 실행하면 모든 테이블(18개)이 만들어집니다.
  ```bash
  mysql -u root -p helloworld < src/main/resources/schema.sql
  ```
  (schema.sql은 노션 `⭐ 마스터 ERD (정본 v1.0)` 기준. ERD가 바뀌면 이 파일도 함께 갱신하세요.)

### 4. 실행
- IntelliJ에서 `HelloWorldApplication` 실행, 또는 터미널에서:
  ```bash
  mvn spring-boot:run
  ```
  (Maven Wrapper `mvnw`는 아직 없습니다. 로컬에 Maven이 설치돼 있어야 합니다.
  없으면 IntelliJ 내장 Maven으로 실행하세요.)

### 5. 확인
- API 문서(Swagger): http://localhost:8080/swagger-ui.html
- 테스트 호출: `GET http://localhost:8080/api/users/check-email?email=test@test.com`

### 6. 🔴 코드 작성 전 필독 문서
개발 시작 전에 아래를 **반드시** 읽으세요. AI 코딩 툴을 쓸 때도 `CLAUDE.md`를 먼저 읽게 하세요.
- 루트의 **`CLAUDE.md`** — AI/사람 공통 필수 규칙 (압축본)
- 팀 노션의 **백엔드 컨벤션 가이드** — 상세 설명
- 팀 노션의 **공통 API 규약서** — 응답 포맷·네이밍·URL·에러 기준

---

## 프로젝트 구조 (도메인형)

```
com.helloworld
├── global              # 전역 공통
│   ├── common          # ApiResponse, PageResponse
│   ├── config          # Redis, Swagger, Web(CORS), Security
│   ├── exception       # GlobalExceptionHandler, BusinessException, ErrorCode
│   ├── security        # JwtTokenProvider
│   └── util
└── domain              # 도메인별 (user/post/comment/like/follow/search/notification/auth)
    └── {domain}
        ├── controller  # HTTP 요청/응답만
        ├── service     # 비즈니스 로직 + 트랜잭션
        ├── mapper      # MyBatis DB 접근 (XML은 resources/mapper/{domain}/)
        ├── dto         # request / response
        └── entity      # DB 테이블 매핑 객체
```

---

## 핵심 개발 규칙 (요약)

- 영속성은 **MyBatis만** (JPA 금지)
- 모든 응답은 `ApiResponse`로 래핑, JSON은 snake_case
- 계층 호출: Controller → Service → Mapper (역방향/건너뛰기 금지)
- 예외는 `BusinessException(ErrorCode)`로 던지고 `GlobalExceptionHandler`가 처리
- 좋아요·팔로우는 Redis 정본 + SQS 비동기 + hard delete

**`user` 도메인이 표준 예시입니다.** 새 도메인은 user 구조(controller/service/mapper/dto/entity + XML)를 복제해 만드세요.

---

## 브랜치 / 커밋 규칙

- 브랜치: `main`(배포) / `develop`(통합) / `feature/{도메인}-{기능}` (예: `feature/post-create`)
- 커밋: `타입: 내용` (타입 = feat/fix/refactor/docs/test/chore)
  - 예: `feat: 게시물 좋아요 토글 API 구현`
- PR은 `develop`으로, 최소 1인 리뷰 후 머지

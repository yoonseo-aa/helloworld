# CLAUDE.md — Hello World 백엔드 AI 코딩 규칙

이 파일은 코드를 생성/수정하기 전에 **반드시 먼저 읽는다.** 아래 규칙을 어기는 코드는 생성하지 않는다.
상세 배경은 `BACKEND_CONVENTION.md` 참고. 규칙이 충돌하면 이 파일과 공통 API 규약서가 우선한다.


## 언어
- 항상 한국어로 답한다. 코드 주석과 설명도 한국어로 작성한다.
- 
## 프로젝트 개요
개발자 SNS "Hello World"의 백엔드. Spring Boot 3 / Java 17 / Maven / MyBatis / MySQL / Redis / SQS.

## 절대 규칙 (위반 금지)

1. **영속성은 MyBatis만 쓴다.** JPA/Hibernate/`@Entity`/`JpaRepository`를 절대 쓰지 않는다. DB 접근은 `@Mapper` 인터페이스 + XML(`resources/mapper/{domain}/`)로만 한다.
2. **모든 API 응답은 `ApiResponse<T>`로 감싼다.**
   - 성공: `{ "status": "SUCCESS", "message": ..., "data": ... }`
   - 에러: `{ "status": "ERROR", "code": ..., "message": ... }`
   - Controller가 raw 객체나 `ResponseEntity<원시DTO>`를 그대로 반환하지 않는다.
3. **JSON 필드는 snake_case.** Java 필드는 camelCase로 쓰되 직렬화는 snake_case(`spring.jackson.property-naming-strategy: SNAKE_CASE` 전제). DTO에 `@JsonProperty`를 개별로 붙이지 않는다.
4. **URL은 `/api/...` (버전 접두어 없음), 리소스는 복수형, URL에 동사 금지.** 행위는 HTTP 메서드로.
5. **계층 호출 방향: Controller → Service → Mapper.** Controller에서 Mapper를 직접 호출하지 않는다. Controller에 비즈니스 로직을 넣지 않는다.
6. **예외는 `BusinessException(ErrorCode)`로 던진다.** Controller/Service에서 try-catch로 에러 응답을 직접 만들지 않는다. `GlobalExceptionHandler`가 처리한다.
7. **트랜잭션은 Service에만.** `@Transactional`은 Service 메서드에 붙인다. 조회 전용은 `readOnly = true`.
8. **SQL은 `#{}` 파라미터 바인딩.** `${}` 문자열 치환 금지(SQL Injection). 동적 쿼리는 `<if>/<where>/<foreach>`.
9. **민감정보 하드코딩 금지.** DB 비번, JWT secret, AWS 키를 코드에 넣지 않는다. 환경변수/프로파일로.
10. **응답 DTO에 민감정보 금지.** password 등은 어떤 응답에도 포함하지 않는다.

## 좋아요 / 팔로우 (특수 규칙)
- 카운트·중복·관계의 **정본은 Redis**. 좋아요=`post:like:count:{id}`/`post:like:users:{id}`, 팔로우=`user:following:{id}`/`user:followers:{id}`.
- 토글은 **Lua 스크립트로 원자적** 처리. 처리 후 즉시 응답하고, RDB 반영은 **SQS 이벤트 발행 → Worker가 비동기**로.
- 취소는 **hard delete** (soft delete/status 컬럼 쓰지 않음).
- 응답 필드는 `is_liked`/`like_count`, `is_following`/`follower_count`로 통일.

## 패키지 구조 (도메인형)
```
com.helloworld
├── global (common/config/exception/security/util)
└── domain
    └── {user|post|comment|like|follow|search|notification|auth|chat|file}
        ├── controller  ├── service  ├── mapper
        ├── dto (request/response)  └── domain
```
새 기능은 해당 도메인 패키지 안에서 이 하위 구조를 따른다.

## 네이밍
- 클래스 PascalCase / 메서드·변수 camelCase / 상수 UPPER_SNAKE / DB snake_case.
- Mapper 메서드: `insert~`, `select~`, `update~`, `delete~`.
- DTO: `~Request`(요청), `~Response`(응답). 엔티티를 Controller에 직접 노출 금지.
- 에러 코드 접두어: `AUTH_`, `USER_`, `POST_`, `COMMENT_`, `SEARCH_`, `COMMON_`, `CHAT_`, `FILE_`.

## 코드 생성 시 체크리스트 (스스로 확인)
- [ ] MyBatis만 썼는가 (JPA 흔적 없는가)
- [ ] 응답을 ApiResponse로 감쌌는가
- [ ] JSON이 snake_case로 나가는가
- [ ] Controller가 Mapper를 직접 부르지 않는가
- [ ] 예외를 BusinessException으로 던지는가
- [ ] SQL에 `#{}`만 썼는가
- [ ] 새 코드가 올바른 도메인 패키지에 있는가

## 확실하지 않을 때
스택·구조·규약이 모호하면 임의로 정하지 말고 사람에게 묻는다. 특히 새 라이브러리 추가, 스키마 변경, 새 엔드포인트 URL 설계는 확인받는다.

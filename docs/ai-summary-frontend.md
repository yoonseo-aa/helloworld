# 프로젝트 AI 요약 — 프론트 연동 가이드

## 사용자 흐름

```
게시물 작성
  └ 저장소 선택          GET  /api/github/repos
      └ README 분석      POST /api/posts/analyze     5~15초
          └ 태그 자동 입력 + 요약 4칸을 수정 가능한 폼으로 표시
              └ 사용자가 문구를 고침                (프론트 로컬 상태)
                  └ 게시                            POST /api/posts   summary 포함
```

요약은 게시물과 **함께** 저장된다. 별도 저장 버튼도, 추가 API 호출도 없다.

**본문은 자동으로 채우지 않는다.** 요약 패널이 프로젝트 설명을 이미 담고 있어서,
본문까지 채우면 한 화면에서 같은 이야기를 두 번 읽게 된다.
본문은 작성자가 하고 싶은 말을 쓰는 자리로 비워 둔다.

---

## 1. 저장소 목록

```
GET /api/github/repos
Authorization: Bearer {access_token}
```

```json
{
  "status": "SUCCESS",
  "data": {
    "repos": [
      {
        "repo_id": 1277498916,
        "name": "finance-compare-app",
        "full_name": "yoonseo-aa/finance-compare-app",
        "html_url": "https://github.com/yoonseo-aa/finance-compare-app",
        "description": null,
        "language": "Vue",
        "updated_at": "2026-06-25T07:36:21Z"
      }
    ]
  }
}
```

- 프로필에 등록한 **GitHub 사용자명**의 공개 저장소를 최근 푸시 순으로 준다
- 포크는 제외. 비공개 저장소는 나오지 않는다
- 사용자명을 등록하지 않았으면 **빈 배열**이다. 오류가 아니므로 "연동된 저장소가 없습니다"만 보여주면 된다

---

## 2. 저장소 분석

저장소를 고르는 순간 호출한다.

```
POST /api/posts/analyze
Authorization: Bearer {access_token}

{ "github_url": "https://github.com/yoonseo-aa/finance-compare-app" }
```

```json
{
  "status": "SUCCESS",
  "data": {
    "tech_stacks": ["Vue", "Python", "CSS", "JavaScript", "Django", "Chart.js", "Pinia"],
    "summary": {
      "one_liner": "금융 상품을 비교하고 사용자 프로필 기반으로 추천하는 웹 애플리케이션입니다.",
      "purpose": "금융감독원 API로 예적금 데이터를 받아 비교하고, 선호 기간과 위험 성향에 맞는 상품을 추천한다.",
      "key_features": [
        "예적금 상품 목록·검색·상세 금리 옵션",
        "금융감독원 API 연동 데이터 갱신",
        "Kakao Maps 기반 근처 은행 검색",
        "개인화 대시보드와 상품 추천"
      ],
      "highlights": [
        "프론트·백엔드 저장소 분리",
        "외부 API 4종에 의존",
        "로그인 없이 상품 비교 가능"
      ],
      "edited": false,
      "generated_at": "2026-08-06T11:11:21",
      "model": "gpt-5.5"
    }
  }
}
```

### 두 값의 용도

| 필드 | 쓰는 곳 |
|---|---|
| `tech_stacks` | 기술스택 **태그 입력칸**에 채운다 |
| `summary` | **요약 편집 폼** 4칸을 채운다 |

### `readme` 가 없어졌다

응답에서 뺐다. 요약 패널이 프로젝트 설명을 이미 담고 있어서, 본문까지 자동으로 채우면
한 화면에서 같은 이야기를 두 번 읽게 된다. README는 요약을 만드는 **재료**로만 쓴다.

프론트에서 지울 곳: `AnalyzeProjectResponse.readme` 타입과, 저장소 분석 성공 시
`setContent(data.readme)` 로 본문을 채우던 코드.

### 요약 안에도 기술 스택이 없다

태그는 게시물의 `tech_stacks` 로 이미 따로 저장되고 화면에도 따로 뜬다.
요약 안에 또 넣으면 같은 목록이 한 화면에 두 번 나온다.

상세 화면의 **사용 기술 스택** 칸은 `post.tech_stacks` 를 그대로 그리면 된다.
요약 패널 안에 있든 밖에 있든 화면상 위치는 자유롭게 잡아도 된다.

### 요약을 못 만들었을 때

```json
{
  "status": "SUCCESS",
  "data": {
    "tech_stacks": ["Vue", "Python"]
  }
}
```

**`summary` 키 자체가 빠진다**(전역 `non_null` 직렬화). `data.summary` 는 `undefined` 가 되므로
`if (!summary)` 로 판별하면 된다.

아래 경우 모두 여기로 온다. **오류가 아니다** — 요약 편집 폼만 접으면 된다.

- README가 없거나 너무 짧다 (공백 제외 200자 미만)
- 저장소가 비공개이거나 존재하지 않는다
- LLM 호출이 실패했다

이때도 `tech_stacks` 는 채워진다. 언어는 GitHub이 실제 파일에서 집계한 값이라
LLM 없이도 확실하기 때문이다.

### ⚠️ 반드시 지켜야 할 세 가지

**1. 응답이 5~15초 걸린다.** GitHub 왕복 2회 + LLM 호출이라 그렇다.
로딩 표시가 없으면 사용자는 멈춘 줄 안다. (이미 "저장소 분석 중..." 표시가 있으니 그대로 쓰면 된다)

**2. axios 기본 타임아웃을 넘긴다.** 공통 클라이언트의 타임아웃이 이보다 짧으면
정상 요청이 취소된다. 이 호출만 `timeout` 을 따로 준다.

```ts
await apiClient.post('/api/posts/analyze', { github_url }, { timeout: 60_000 })
```

**3. 중복 클릭을 막는다.** 저장소를 연달아 바꾸면 요청이 쌓이고, **호출 한 번마다 과금된다.**
이전 요청은 `AbortController` 로 취소한다.

---

## 3. 요약 편집

받은 `summary` 를 폼 상태에 넣고 사용자가 고친다. **저장 전까지는 전부 프론트 로컬 상태다.**
편집 중에 서버를 부를 일이 없다.

| 화면 | 필드 | 입력 형태 |
|---|---|---|
| 한 줄 소개 | `one_liner` | 한 줄 입력 |
| 주요 목적 | `purpose` | 여러 줄 입력 |
| 핵심 기능 | `key_features` | 항목 추가·삭제 가능한 목록 |
| 프로젝트 특징 | `highlights` | 항목 추가·삭제 가능한 목록 |

**길이 제한** — 넘으면 게시가 400으로 막히니 입력 단계에서 잘라주는 게 좋다.

| 필드 | 상한 |
|---|---|
| `one_liner` | 150자 |
| `purpose` | 400자 |
| `key_features` | 8개, 항목당 80자 |
| `highlights` | 8개, 항목당 60자 |

**모든 칸을 비우면 요약이 저장되지 않는다.** "요약 빼기"를 따로 만들지 않아도
사용자가 다 지우면 그렇게 동작한다.

`edited`·`generated_at`·`model` 은 **편집 대상이 아니다.** 보내도 무시된다 —
출처 정보라 서버가 직접 채운다.

---

## 4. 게시물 작성

고친 요약을 **게시물과 함께** 보낸다.

```
POST /api/posts

{
  "post_type": "PROJECT",
  "content": "...",
  "github_url": "https://github.com/yoonseo-aa/finance-compare-app",
  "tech_stacks": ["Vue", "Django"],
  "summary": {
    "one_liner": "...",
    "purpose": "...",
    "key_features": ["...", "..."],
    "highlights": ["...", "..."]
  }
}
```

- `summary` 는 **선택**이다. 안 보내면 서버가 분석 때 만들어둔 원본을 그대로 저장한다
- 네 필드만 보낸다. `edited`·`generated_at`·`model` 은 보내도 서버가 덮어쓴다
- 저장소를 고르지 않은 게시물(카드뉴스 등)은 `summary` 없이 그냥 보내면 된다

### `edited` 는 서버가 정한다

서버가 분석 때 만든 원본을 1시간 동안 들고 있다가, 보낸 값과 **직접 비교**해서 정한다.
프론트가 플래그를 보낼 필요가 없다.

- 원본과 같다 → `edited: false` → 배지 **"README 기반 자동 요약"**
- 원본과 다르다 → `edited: true` → 배지 **"작성자가 수정함"** (문구는 정하기 나름)

사람이 고쳐 쓴 글에 "AI가 분석해 요약했습니다"가 붙어 있으면 읽는 사람이 잘못 판단한다.
그래서 구분한다.

저장소를 고르고 **1시간 넘게** 글을 쓰면 비교할 원본이 사라져 `edited: true` 로 저장된다.
고쳤는지 알 수 없을 때 "AI가 만들었습니다"라고 붙이는 쪽이 더 나쁜 오류라서 그렇게 뒀다.

---

## 5. 상세 화면 표시

```
GET /api/posts/{post_id}
```

응답의 `data.summary` 가 저장된 `RepoSummary` 다. **요약이 없으면 키 자체가 없다.**

```ts
const summary = post.summary
if (!summary) return null      // AI 요약 패널을 렌더링하지 않음
```

| 화면 | 출처 |
|---|---|
| 한 줄 소개 | `summary.one_liner` |
| 주요 목적 | `summary.purpose` |
| 핵심 기능 (체크 목록) | `summary.key_features` |
| 사용 기술 스택 (태그) | **`post.tech_stacks`** ← 요약 밖 |
| 프로젝트 특징 (체크 목록) | `summary.highlights` |
| 배지 문구 | `summary.edited` |

배열이 빈 경우 해당 섹션은 숨긴다. 모델이 근거를 못 찾으면 빈 배열로 오는데,
없는 내용을 지어내지 않게 한 결과다.

`generated_at`·`model` 은 화면에 쓰지 않아도 된다. "언제, 어느 모델로 만든 요약인지"를
나중에 판단하기 위한 값이다.

---

## 6. 타입

```ts
/** 서버가 돌려주는 요약 (읽기) */
export interface RepoSummary {
  one_liner: string
  purpose: string
  key_features: string[]
  highlights: string[]
  edited: boolean
  generated_at: string
  model: string
}

/** 게시물과 함께 보내는 요약 (쓰기) — 네 필드만 */
export interface RepoSummaryInput {
  one_liner: string
  purpose: string
  key_features: string[]
  highlights: string[]
}

export interface AnalyzeProjectResponse {
  tech_stacks: string[]
  summary?: RepoSummary        // ← 추가
  // readme 는 제거됐다 — 본문은 작성자가 직접 쓴다
}

export interface PostCreateRequest {
  // ...기존 필드
  summary?: RepoSummaryInput   // ← 추가
}
```

읽기/쓰기 타입을 나눈 이유는 `edited`·`generated_at`·`model` 을 실수로 보내지 않게 하기 위해서다.
하나로 합치고 싶으면 `Omit<RepoSummary, 'edited' | 'generated_at' | 'model'>` 로 써도 된다.

---

## 7. 바뀌는 것 정리

**추가**

- `RepoSummary` / `RepoSummaryInput` 타입
- `AnalyzeProjectResponse.summary`
- `PostCreateRequest.summary`
- 작성 폼의 **요약 편집 UI** (4칸)
- 상세 화면의 **AI 요약 패널**

**변경**

- `PostDetailResponse.summary` 가 **문자열 → 객체**. 기존 코드가 깨진다.
  `CommentPanel.tsx` 가 `<MarkdownContent>{summary}</MarkdownContent>` 로 넘기는데,
  react-markdown은 문자열이 아니면 **던진다**. 반드시 같이 고쳐야 한다

**제거**

- `AnalyzeProjectResponse.readme` — 응답에서 사라졌다.
  분석 성공 시 본문을 채우던 `setContent(data.readme)` 도 함께 지운다
- `POST /api/posts/{post_id}/ai-summary` 규약 — 쓰지 않는다.
  요약은 저장소를 고르는 시점에 만들어지고 게시물과 함께 저장된다.
  백엔드에 이 경로가 없어 지금은 404가 난다
- 작성 폼의 "프로젝트 요약" 자유 입력칸 — 이 컬럼은 이제 구조화된 요약 전용이다

---

## 8. 동작 확인

README가 충실한 저장소 (공백 제외 3,344자):

```
https://github.com/yoonseo-aa/finance-compare-app
```

README가 거의 없는 저장소 (요약 없이 `tech_stacks` 만):

```
https://github.com/octocat/Hello-World
```

---

## 참고: 서버가 실패를 다루는 방식

| 상황 | 응답 |
|---|---|
| 분석 정상 | `200` + `tech_stacks`·`summary` |
| README 부족·LLM 실패 | `200` + `tech_stacks`, `summary` 없음 |
| 저장소 없음·비공개·GitHub 주소 아님 | `200` + `tech_stacks` 빈 배열, `summary` 없음 |
| `github_url` 누락 (분석) | `400` |
| 요약 길이 초과 (게시) | `400` |
| 미인증 | `401` |

**요약을 못 만드는 것은 오류가 아니다.** 404나 500을 주면 프론트가 오류 분기를 만들어야 하는데,
정상적인 상태를 오류로 다루게 된다.

# DB 마이그레이션 기록

`schema.sql`은 **DB를 처음 만들 때만** 실행됩니다. 이미 만들어진 DB(운영 서버, 팀원 로컬)에는
컬럼 추가 같은 변경이 자동으로 반영되지 않습니다.

그래서 **스키마를 바꿀 때마다 여기에 같은 내용의 ALTER 문을 남깁니다.**
누가 무엇을 실행해야 하는지 기록으로 남아, "나만 500 에러 나요" 상황을 예방합니다.

## 규칙

1. `schema.sql`을 수정하면 **반드시** 여기에 같은 변경의 ALTER 문을 추가한다.
2. 파일명은 `번호_설명.sql` (예: `002_add_posts_deleted_at.sql`). 번호는 순서대로.
3. 파일 상단에 **배경**과 **적용 상태 체크박스**를 적는다.
4. MR 설명에 "이 마이그레이션 실행 필요"를 명시한다.

## 적용 방법

**운영 서버** (SSH 접속 후)
```bash
docker exec -it helloworld-mysql mysql -uroot -p helloworld
# 그 다음 해당 .sql 내용 붙여넣기
```

**로컬**
- 인텔리제이 Database 창에서 `helloworld` 연결 후 실행
- 또는 도커 볼륨을 지우고 다시 만들면 `schema.sql`이 처음부터 실행되므로 불필요
  (기존 로컬 데이터는 사라짐)

## 목록

| 번호 | 내용 | 운영 적용 |
|---|---|---|
| 001 | `users.introduce` 컬럼 추가 | ✅ 2026-07-29 |
| 002 | `tags` 마스터 시드 12건 (초안 — 팀 조정 예정) | ✅ 2026-07-31 |
| 003 | `users.exp_point` / `level` 컬럼 제거 (미사용) | ✅ 2026-07-31 |
| 004 | `dm_messages.client_message_id` 추가 + UNIQUE (중복 전송 방지) | ✅ 2026-08-03 |
| 005 | `dm_messages (room_id, message_id, sender_id)` 인덱스 추가 (대화 목록 성능) | ✅ 2026-08-04 |
| 006 | `post_likes` 커서 인덱스 2개 추가 + 중복된 `idx_post_likes_user` 제거 | ✅ 2026-08-05 (실측 확인) |
| 007 | `dm_members.is_accepted` / `is_muted` 제거 (기능 미구현 확정) | ✅ 2026-08-05 |
| 008 | `posts.content` ngram FULLTEXT 인덱스 추가 (검색 파트 — **없으면 통합검색 기본(ALL)이 500**) | ✅ 2026-08-05 (실측 확인) |
| 009 | `search_histories (user_id, keyword, search_type)` UNIQUE 추가 (검색어 자동저장 UPSERT 원자성) | ✅ 2026-08-05 (실측 확인) |
| 010 | `comments.like_count` 컬럼 추가 (댓글 좋아요 수 캐시) | ✅ 2026-08-06 (실측 확인) |
| 011 | `github_accounts` / `github_stats` 테이블 추가 (잔디 · 기술스택 연동) | ⬜ 미적용 |

> **이 표는 사람이 손으로 적는 메모입니다 — 실제 DB와 어긋날 수 있습니다.**
> 2026-08-05에 전수 점검해보니 006이 이미 적용돼 있는데 표에는 "미적용"으로 남아 있었습니다.
> 표를 근거로 판단하지 말고 **DB에 직접 물어보세요.**
>
> ```sql
> -- 컬럼 추가/삭제 확인
> SELECT COLUMN_NAME FROM information_schema.COLUMNS
>  WHERE TABLE_SCHEMA='helloworld' AND TABLE_NAME='dm_members';
> -- 인덱스 확인
> SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
>  WHERE TABLE_SCHEMA='helloworld' AND TABLE_NAME='post_likes';
> ```

> ⚠️ **번호를 정하기 전에 `git fetch` 후 `origin/develop`의 이 디렉터리를 확인하세요.**
> 2026-08-04에 두 브랜치가 동시에 `005`를 써서 충돌했습니다
> (채팅 인덱스 / `post_likes` 인덱스). 아직 적용되지 않은 `post_likes` 쪽을 `006`으로 바꿔 정리했습니다.
> 이미 운영에 적용된 번호는 바꿀 수 없으니(적용 기록이 어긋납니다), **미적용 쪽을 양보**하면 됩니다.
> 2026-08-06 develop 머지 시 `comments.like_count`(미적용)가 develop의 008(ngram)·009(unique)와
> 겹쳐 `010`으로 양보했습니다.
>
> GitHub 연동 브랜치는 같은 일을 네 번 겪었습니다. `007`로 시작해 `008` → `010`을 거쳐
> 최종 `011`이 됐는데, **번호를 정한 시점에는 비어 있던 자리**를 브랜치가 열려 있는 동안
> develop이 007·008·009·010으로 차례차례 가져갔기 때문입니다.
>
> 교훈은 "처음에 잘 고르기"가 아니라 **번호는 머지 직전에 확정한다**는 쪽입니다.
> 브랜치가 오래 열려 있을수록 어긋날 확률이 올라가므로, MR을 올리기 직전에
> `git fetch` 후 이 디렉터리를 다시 확인하고 필요하면 그때 파일명을 바꾸세요.

> **시드 데이터 수정 규칙**: 이미 실행된 파일을 고치면 환경마다 상태가 어긋납니다.
> 태그를 바꿀 때는 `002`를 수정하지 말고 `003_*.sql`을 새로 만들어 INSERT/UPDATE/DELETE 하세요.

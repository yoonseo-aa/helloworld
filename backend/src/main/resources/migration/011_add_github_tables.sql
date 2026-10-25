-- =====================================================================
-- 011. GitHub 연동 · 잔디(일별 커밋 수) 테이블 추가
--
-- 번호 이력: 007 → 008 → 010 → 011. 이 브랜치가 열려 있는 동안 develop이 먼저
--            007(dm_members 정리) · 008(posts FULLTEXT) · 009(search_histories UNIQUE) ·
--            010(comments.like_count)을 차례로 가져갔다. 넷 다 이미 운영에 적용돼
--            번호를 되돌릴 수 없으므로, README 규칙대로 미적용인 이쪽이 양보했다.
--
-- 배경: 프로필에 GitHub 잔디를 최근 1년(롤링) 일별로 그린다.
--       조회 때마다 GitHub을 호출하면 (1) 응답이 GitHub 왕복만큼 느리고
--       (2) 토큰당 5000 point/hr 레이트리밋을 프로필 열람 트래픽이 먹어버려
--       정작 밤 배치가 실패한다. 그래서 매일 새벽 3시 배치로 적재하고
--       프로필 조회는 DB만 읽는다.
--
-- 이 숫자의 정의 = "순수 커밋 수":
--   GitHub GraphQL 의 contributionsCollection.commitContributionsByRepository 로 얻는다.
--
--   주의: GitHub이 세는 커밋에는 규칙이 있다 — 기본 브랜치(또는 gh-pages)의 커밋이어야 하고,
--   커밋 이메일이 GitHub 계정에 연결돼 있어야 하며, 포크 저장소는 제외된다.
--   회사 노트북에서 다른 이메일로 커밋한 사용자는 체감 커밋 수와 값이 어긋난다.
--
-- 토큰 보관에 대하여:
--   access_token 은 사용자를 대신해 GitHub을 호출할 수 있는 자격증명이다.
--   평문으로 두지 않는다 — 애플리케이션에서 AES-GCM으로 암호화한 값을 저장하며,
--   키는 환경변수(GITHUB_TOKEN_ENC_KEY)로 주입한다.
--
-- 적용: 운영 DB / 각자 로컬 DB에 한 번씩 실행
-- =====================================================================

USE helloworld;

-- ---------------------------------------------------------------------
-- GitHub 연동 계정 (users 1 : 1 github_accounts)
-- ---------------------------------------------------------------------
CREATE TABLE github_accounts (
    github_account_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id           BIGINT       NOT NULL,
    github_id         BIGINT       NOT NULL COMMENT 'GitHub 사용자 고유 ID (login 변경에도 불변)',
    github_login      VARCHAR(100) NOT NULL COMMENT 'GitHub 사용자명. 변경될 수 있어 동기화 때마다 갱신',
    access_token      VARCHAR(500) NOT NULL COMMENT 'GitHub OAuth access token (AES-GCM 암호화 저장, 평문 금지)',
    last_synced_at    DATETIME     NULL COMMENT '마지막 동기화 완료 시각. NULL이면 아직 한 번도 성공 못 함',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (github_account_id),
    -- 한 사용자당 하나의 GitHub 계정만. 재연동은 INSERT가 아니라 UPSERT가 된다.
    UNIQUE KEY uk_github_accounts_user (user_id),
    -- 같은 GitHub 계정을 여러 회원이 붙잡지 못하게 한다(잔디 도용 방지).
    UNIQUE KEY uk_github_accounts_github_id (github_id),
    CONSTRAINT fk_github_accounts_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- GitHub 통계 (사용자당 1행 — 잔디 + 기술스택)
-- ---------------------------------------------------------------------
-- 잔디와 언어 통계를 한 테이블에 두는 이유: 같은 GraphQL 요청으로 받고, 같은 배치가
-- 같은 주기로 갱신하며, 둘 다 사용자당 1행이다. 라이프사이클이 완전히 같아서
-- 나누면 조회 때 조인만 늘어난다.
--
-- languages 형태:
--   { "TypeScript": 812340, "Java": 455210, "CSS": 98120 }
--     키 = 언어명, 값 = 코드 바이트 수 (GitHub 저장소 언어 바와 같은 기준)
--   본인 소유 저장소만, 포크는 제외하고 합산한다(남의 코드가 내 스택으로 잡히면 안 된다).
--
--   ⚠️ 비율이 아니라 원본 바이트를 저장한다. 화면에 쓸 비율·상위 N개·최소 비율 같은
--   표시 규칙은 조회할 때 계산한다. 그래야 기준을 바꿀 때 전 사용자 재동기화가 필요 없다.
--
--   바이트 기준은 파일 크기라 왜곡이 있다 — 빌드 산출물이나 대용량 데이터 파일이 커밋돼
--   있으면 그 언어가 1위로 올라온다. GitHub 저장소 페이지의 언어 바와 같은 방식이라
--   사용자에게 익숙하다는 점을 택한 것이다.
--
-- daily_commits 형태:
--   { "2026-08-03": [2, 7], "2026-08-02": [0, 3] }
--     키   = 날짜 (YYYY-MM-DD)
--     값   = [공개 저장소 커밋 수, 비공개 저장소 커밋 수]
--   커밋이 없는 날은 키가 없다. 화면에 필요한 0은 조회 시 애플리케이션이 채운다.
--   매일 커밋한 사용자여도 최대 366개 항목(약 7KB)이다.
--
-- 왜 날짜당 1행이 아니라 사용자당 1행인가:
--   읽기는 항상 "한 사람의 1년 전체", 쓰기는 "매일 밤 1년치를 통째로 교체"다.
--   즉 부분 조회도 부분 갱신도 없다. 날짜당 1행으로 쪼개면 매일 커밋하는 사용자
--   한 명당 366행이 쌓여 회원 수만큼 곱해지는데, 그렇게 늘린 행으로 할 수 있는 일이
--   지금 요구에는 없다.
--
-- 왜 배열이 아니라 날짜 키 객체인가:
--   구간이 롤링(오늘 기준 최근 1년)이라 매일 하루씩 밀린다. 배열로 두면
--   "몇 번째 원소가 며칠인지"를 계속 계산해야 하고, 그 계산이 어긋나면 잔디 칸이
--   통째로 밀린 채 아무 오류 없이 그려진다. 키가 날짜면 그 계산 자체가 없다.
--
-- active_days / total_commits 를 컬럼으로 빼는 이유:
--   JSON 안을 세면 나오는 값이지만, 어차피 매일 문서를 통째로 다시 쓸 때 계산하면 공짜다.
--   배지(누적 활동일수 기준)와 랭킹이 JSON 파싱 없이 인덱스 조회로 끝난다.
CREATE TABLE github_stats (
    user_id       BIGINT   NOT NULL,
    daily_commits JSON     NOT NULL COMMENT '{"YYYY-MM-DD":[공개,비공개]} — 커밋한 날만',
    languages     JSON     NOT NULL COMMENT '{"언어명":바이트수} — 본인 소유·포크 제외 저장소 합산',
    active_days   INT      NOT NULL DEFAULT 0 COMMENT '커밋한 날 수 (= daily_commits 항목 수). 배지 기준',
    total_commits INT      NOT NULL DEFAULT 0 COMMENT '구간 전체 커밋 합계',
    period_from   DATE     NOT NULL COMMENT '구간 시작(일요일로 맞춤 — 잔디 격자 첫 열)',
    period_to     DATE     NOT NULL COMMENT '구간 끝(동기화 당일)',
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    -- 배지 집계·랭킹용. "활동일 100일 이상인 회원" 같은 조회가 인덱스로 끝난다.
    KEY idx_github_stats_active_days (active_days),
    CONSTRAINT fk_github_stats_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Hello World - 데이터베이스 스키마 (schema.sql)
-- 기준: 노션 '⭐ 마스터 ERD (정본 v1.0)'
-- DB: MySQL 8.x / 문자셋: utf8mb4
--
-- 사용법:
--   1) CREATE DATABASE helloworld CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   2) USE helloworld;
--   3) 이 파일 전체 실행
--
-- 참고:
--  - ERD의 profile_img_url 은 코드/공통 규약 기준으로 profile_image_url 로 통일함.
--  - 좋아요/팔로우 카운트의 정본은 Redis. 여기 카운트 컬럼(like_count 등)은 비동기 백업본.
--  - 좋아요/팔로우 취소는 hard delete (상태 컬럼 없음).
-- =====================================================================

USE helloworld;

SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 1. 사용자 · 프로필 도메인
-- =========================================================

CREATE TABLE users (
    user_id            BIGINT       NOT NULL AUTO_INCREMENT,
    auth_provider      VARCHAR(20)  NOT NULL COMMENT 'LOCAL, GOOGLE',
    social_id          VARCHAR(255) NULL,
    login_id           VARCHAR(50)  NULL,
    password           VARCHAR(255) NULL COMMENT '암호화 저장',
    email              VARCHAR(100) NULL,
    nickname           VARCHAR(30)  NULL COMMENT '닉네임 (프로필 생성 단계에서 설정, 검색 대상). UNIQUE 유지',
    profile_image_url  VARCHAR(500) NULL,
    introduce          VARCHAR(255) NULL COMMENT '한줄소개 (프로필 생성 단계에서 설정)',
    github_username    VARCHAR(100) NULL COMMENT '잔디 연동용',
    role               VARCHAR(20)  NOT NULL DEFAULT 'USER',
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_users_social_id (social_id),
    UNIQUE KEY uk_users_login_id (login_id),
    UNIQUE KEY uk_users_nickname (nickname),
    UNIQUE KEY uk_users_github_username (github_username),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 태그 마스터 (기술/포지션/도메인)
CREATE TABLE tags (
    tag_id    BIGINT      NOT NULL AUTO_INCREMENT,
    tag_type  VARCHAR(20) NOT NULL COMMENT 'TECH, POSITION, DOMAIN',
    tag_name  VARCHAR(50) NOT NULL,
    PRIMARY KEY (tag_id),
    UNIQUE KEY uk_tags_name (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_interests (
    interest_id BIGINT   NOT NULL AUTO_INCREMENT,
    user_id     BIGINT   NOT NULL,
    tag_id      BIGINT   NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (interest_id),
    UNIQUE KEY uk_user_interests (user_id, tag_id),
    KEY idx_user_interests_tag (tag_id),
    CONSTRAINT fk_user_interests_user FOREIGN KEY (user_id) REFERENCES users (user_id),
    CONSTRAINT fk_user_interests_tag  FOREIGN KEY (tag_id)  REFERENCES tags (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_badges (
    badge_id    BIGINT      NOT NULL AUTO_INCREMENT,
    user_id     BIGINT      NOT NULL,
    badge_name  VARCHAR(100) NOT NULL,
    badge_color VARCHAR(7)  NOT NULL DEFAULT '#FFFFFF',
    acquired_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (badge_id),
    KEY idx_user_badges_user (user_id),
    CONSTRAINT fk_user_badges_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tech_stack_cards (
    card_id     BIGINT      NOT NULL AUTO_INCREMENT,
    user_id     BIGINT      NOT NULL,
    tech_name   VARCHAR(50) NOT NULL,
    proficiency VARCHAR(10) NOT NULL COMMENT '초급/중급/고급',
    usage_count INT         NOT NULL DEFAULT 0,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id),
    KEY idx_tech_stack_cards_user (user_id),
    CONSTRAINT fk_tech_stack_cards_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 팔로우 (Redis 정본, RDB는 백업. 취소는 hard delete)
CREATE TABLE follows (
    follow_id    BIGINT   NOT NULL AUTO_INCREMENT,
    follower_id  BIGINT   NOT NULL COMMENT '팔로우 거는 사람',
    following_id BIGINT   NOT NULL COMMENT '팔로우 받는 사람',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follow_id),
    UNIQUE KEY uk_follows (follower_id, following_id),
    KEY idx_follows_following (following_id),
    CONSTRAINT fk_follows_follower  FOREIGN KEY (follower_id)  REFERENCES users (user_id),
    CONSTRAINT fk_follows_following FOREIGN KEY (following_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GitHub 연동 계정 (users 1 : 1). access_token은 암호화해서 저장한다(평문 금지).
CREATE TABLE github_accounts (
    github_account_id BIGINT       NOT NULL AUTO_INCREMENT,
    user_id           BIGINT       NOT NULL,
    github_id         BIGINT       NOT NULL COMMENT 'GitHub 사용자 고유 ID (login 변경에도 불변)',
    github_login      VARCHAR(100) NOT NULL COMMENT 'GitHub 사용자명. 변경될 수 있어 동기화 때마다 갱신',
    access_token      VARCHAR(500) NOT NULL COMMENT 'GitHub OAuth access token (AES-GCM 암호화 저장)',
    last_synced_at    DATETIME     NULL COMMENT '마지막 잔디 동기화 완료 시각',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (github_account_id),
    UNIQUE KEY uk_github_accounts_user (user_id),
    UNIQUE KEY uk_github_accounts_github_id (github_id),
    CONSTRAINT fk_github_accounts_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GitHub 통계 (사용자당 1행 — 잔디 + 기술스택).
-- daily_commits = { "2026-08-03": [공개커밋수, 비공개커밋수], ... } — 커밋한 날만 담는다.
-- languages     = { "TypeScript": 812340, "Java": 455210 } — 언어별 코드 바이트 수.
--                 본인 소유·포크 제외 저장소만 합산한다.
-- 잔디와 언어를 한 테이블에 두는 이유: 같은 GraphQL 요청으로 받고 같은 배치가 같은 주기로
-- 갱신하며 둘 다 사용자당 1행이다. 나누면 조회 때 조인만 늘어난다.
-- 비율이 아니라 원본 바이트를 저장한다 — 상위 N개·최소 비율 같은 표시 규칙은 조회 시 계산해야
-- 기준을 바꿀 때 전 사용자 재동기화가 필요 없다.
-- 읽기는 항상 "한 사람의 1년 전체", 쓰기는 "매일 밤 통째로 교체"라 부분 조회·부분 갱신이 없다.
-- 날짜당 1행으로 쪼개면 매일 커밋하는 사용자당 366행이 회원 수만큼 곱해지는데,
-- 그렇게 늘린 행으로 할 수 있는 일이 지금 요구에는 없다.
-- 배열이 아니라 날짜 키 객체인 이유: 구간이 롤링이라 매일 밀려서, 배열이면 "몇 번째가 며칠인지"를
-- 계속 계산해야 하고 그게 어긋나면 잔디가 아무 오류 없이 한 칸씩 밀린 채 그려진다.
CREATE TABLE github_stats (
    user_id       BIGINT   NOT NULL,
    daily_commits JSON     NOT NULL COMMENT '{"YYYY-MM-DD":[공개,비공개]} — 커밋한 날만',
    languages     JSON     NOT NULL COMMENT '{"언어명":바이트수} — 본인 소유·포크 제외',
    active_days   INT      NOT NULL DEFAULT 0 COMMENT '커밋한 날 수. 배지 기준',
    total_commits INT      NOT NULL DEFAULT 0 COMMENT '구간 전체 커밋 합계',
    period_from   DATE     NOT NULL COMMENT '구간 시작(일요일로 맞춤)',
    period_to     DATE     NOT NULL COMMENT '구간 끝(동기화 당일)',
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    KEY idx_github_stats_active_days (active_days),
    CONSTRAINT fk_github_stats_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 2. 콘텐츠 · 피드 도메인
-- =========================================================

CREATE TABLE posts (
    post_id       BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL COMMENT '작성자',
    post_type     VARCHAR(20)  NOT NULL COMMENT 'PROJECT, CARD_NEWS',
    content       TEXT         NOT NULL COMMENT 'Markdown',
    thumbnail_url VARCHAR(500) NULL,
    github_url    VARCHAR(500) NULL COMMENT 'GitHub Repository URL (PROJECT 게시물)',
    project_link  VARCHAR(500) NULL COMMENT 'iframe 시연 URL (= 배포 deploy_url)',
    ai_summary    TEXT         NULL COMMENT 'AI 또는 사용자 작성 프로젝트 요약',
    view_count    INT          NOT NULL DEFAULT 0,
    like_count    INT          NOT NULL DEFAULT 0 COMMENT 'Redis 정본의 백업 캐시',
    comment_count INT          NOT NULL DEFAULT 0,
    is_public     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id),
    KEY idx_posts_user (user_id),
    KEY idx_posts_created (created_at),
    FULLTEXT KEY ft_posts_content (content) WITH PARSER ngram,
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_medias (
    media_id      BIGINT      NOT NULL AUTO_INCREMENT,
    post_id       BIGINT      NOT NULL,
    media_type    VARCHAR(20) NOT NULL COMMENT 'IMAGE, VIDEO, CODE_SNIPPET',
    media_url     TEXT        NOT NULL COMMENT 'S3 주소 또는 코드 원문',
    display_order INT         NOT NULL DEFAULT 0,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (media_id),
    KEY idx_post_medias_post (post_id),
    CONSTRAINT fk_post_medias_post FOREIGN KEY (post_id) REFERENCES posts (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_tags (
    post_tag_id BIGINT NOT NULL AUTO_INCREMENT,
    post_id     BIGINT NOT NULL,
    tag_id      BIGINT NOT NULL,
    PRIMARY KEY (post_tag_id),
    UNIQUE KEY uk_post_tags (post_id, tag_id),
    KEY idx_post_tags_tag (tag_id),
    CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES posts (post_id),
    CONSTRAINT fk_post_tags_tag  FOREIGN KEY (tag_id)  REFERENCES tags (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 게시물 좋아요 (Redis 정본, RDB 백업. hard delete)
CREATE TABLE post_likes (
    like_id    BIGINT   NOT NULL AUTO_INCREMENT,
    post_id    BIGINT   NOT NULL,
    user_id    BIGINT   NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (like_id),
    UNIQUE KEY uk_post_likes (post_id, user_id),
    -- 커서 페이지네이션용 복합 인덱스 (005). 목록 조회 두 개가
    -- "WHERE post_id/user_id = ? AND like_id < ? ORDER BY like_id DESC" 형태라
    -- 두 번째 컬럼이 like_id여야 정렬까지 인덱스로 받는다(filesort 제거).
    -- idx_post_likes_user_cursor 의 선두가 user_id라 fk_post_likes_user 의 인덱스 요건도 만족한다.
    KEY idx_post_likes_post_cursor (post_id, like_id),
    KEY idx_post_likes_user_cursor (user_id, like_id),
    CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts (post_id),
    CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE post_bookmarks (
    bookmark_id BIGINT   NOT NULL AUTO_INCREMENT,
    post_id     BIGINT   NOT NULL,
    user_id     BIGINT   NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bookmark_id),
    UNIQUE KEY uk_post_bookmarks (post_id, user_id),
    KEY idx_post_bookmarks_user (user_id),
    CONSTRAINT fk_post_bookmarks_post FOREIGN KEY (post_id) REFERENCES posts (post_id),
    CONSTRAINT fk_post_bookmarks_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comments (
    comment_id        BIGINT   NOT NULL AUTO_INCREMENT,
    post_id           BIGINT   NOT NULL,
    user_id           BIGINT   NOT NULL COMMENT '작성자',
    parent_comment_id BIGINT   NULL COMMENT '대댓글 (Self-Join)',
    content           TEXT     NOT NULL,
    is_deleted        BOOLEAN  NOT NULL DEFAULT FALSE COMMENT 'Soft Delete',
    like_count        INT      NOT NULL DEFAULT 0 COMMENT 'Redis 정본의 백업 캐시',
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id),
    KEY idx_comments_post (post_id),
    KEY idx_comments_user (user_id),
    KEY idx_comments_parent (parent_comment_id),
    CONSTRAINT fk_comments_post   FOREIGN KEY (post_id)           REFERENCES posts (post_id),
    CONSTRAINT fk_comments_user   FOREIGN KEY (user_id)           REFERENCES users (user_id),
    CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES comments (comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 댓글 좋아요 (Redis 정본, RDB 백업. hard delete)
CREATE TABLE comment_likes (
    comment_like_id BIGINT   NOT NULL AUTO_INCREMENT,
    comment_id      BIGINT   NOT NULL,
    user_id         BIGINT   NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_like_id),
    UNIQUE KEY uk_comment_likes (comment_id, user_id),
    KEY idx_comment_likes_user (user_id),
    CONSTRAINT fk_comment_likes_comment FOREIGN KEY (comment_id) REFERENCES comments (comment_id),
    CONSTRAINT fk_comment_likes_user    FOREIGN KEY (user_id)    REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE search_histories (
    search_id   BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    keyword     VARCHAR(255) NOT NULL,
    search_type VARCHAR(20)  NOT NULL DEFAULT 'ALL' COMMENT 'ALL, POST, USER, TECH_STACK',
    searched_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (search_id),
    UNIQUE KEY uk_search_histories (user_id, keyword, search_type),
    KEY idx_search_histories_user (user_id, searched_at),
    CONSTRAINT fk_search_histories_user FOREIGN KEY (user_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 3. 알림 도메인
-- =========================================================

CREATE TABLE notifications (
    notification_id   BIGINT      NOT NULL AUTO_INCREMENT,
    recipient_id      BIGINT      NOT NULL COMMENT '알림 받는 사람',
    actor_id          BIGINT      NOT NULL COMMENT '알림 발생시킨 사람',
    type              VARCHAR(20) NOT NULL COMMENT 'LIKE, COMMENT, FOLLOW',
    target_post_id    BIGINT      NULL,
    target_comment_id BIGINT      NULL,
    is_read           BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id),
    KEY idx_notifications_recipient (recipient_id, is_read, created_at),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id)      REFERENCES users (user_id),
    CONSTRAINT fk_notifications_actor     FOREIGN KEY (actor_id)          REFERENCES users (user_id),
    CONSTRAINT fk_notifications_post      FOREIGN KEY (target_post_id)    REFERENCES posts (post_id),
    CONSTRAINT fk_notifications_comment   FOREIGN KEY (target_comment_id) REFERENCES comments (comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- 4. 실시간 메신저 (DM) 도메인
-- =========================================================

CREATE TABLE dm_rooms (
    room_id    BIGINT       NOT NULL AUTO_INCREMENT,
    room_type  VARCHAR(10)  NOT NULL COMMENT 'DIRECT, GROUP',
    title      VARCHAR(100) NULL COMMENT '그룹방명 (DIRECT은 NULL)',
    created_by BIGINT       NULL COMMENT '개설자',
    pair_key   VARCHAR(65)  NULL COMMENT 'DIRECT 중복방 방지 (minId_maxId)',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id),
    UNIQUE KEY uk_dm_rooms_pair_key (pair_key),
    CONSTRAINT fk_dm_rooms_creator FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dm_messages (
    message_id   BIGINT      NOT NULL AUTO_INCREMENT,
    room_id      BIGINT      NOT NULL,
    sender_id    BIGINT      NOT NULL,
    message_type VARCHAR(10) NOT NULL DEFAULT 'TEXT' COMMENT 'TEXT, IMAGE, VIDEO, SYSTEM',
    content      TEXT        NOT NULL,
    client_message_id VARCHAR(64) NULL COMMENT '클라이언트 생성 식별자 (중복 전송 방지)',
    deleted_at   DATETIME    NULL COMMENT '삭제 soft',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id),
    UNIQUE KEY uk_dm_messages_client (room_id, sender_id, client_message_id),
    KEY idx_dm_messages_room_created (room_id, created_at),
    -- 대화 목록의 '마지막 메시지'(MAX)와 '안읽음 수'(message_id > last_read) 계산용.
    -- 위 (room_id, created_at)만으로는 방의 전체 항목을 스캔한다(005 마이그레이션 참고).
    KEY idx_dm_messages_room_msg (room_id, message_id, sender_id),
    CONSTRAINT fk_dm_messages_room   FOREIGN KEY (room_id)   REFERENCES dm_rooms (room_id),
    CONSTRAINT fk_dm_messages_sender FOREIGN KEY (sender_id) REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dm_members (
    member_id            BIGINT      NOT NULL AUTO_INCREMENT,
    room_id              BIGINT      NOT NULL,
    user_id              BIGINT      NOT NULL,
    member_role          VARCHAR(10) NOT NULL DEFAULT 'MEMBER' COMMENT 'OWNER, MEMBER',
    last_read_message_id BIGINT      NULL COMMENT '읽음 처리 / 안읽음 카운트',
    joined_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at              DATETIME    NULL COMMENT '나가기 soft (NULL=참여중)',
    PRIMARY KEY (member_id),
    UNIQUE KEY uk_dm_members (room_id, user_id),
    KEY idx_dm_members_user (user_id),
    CONSTRAINT fk_dm_members_room    FOREIGN KEY (room_id)              REFERENCES dm_rooms (room_id),
    CONSTRAINT fk_dm_members_user    FOREIGN KEY (user_id)              REFERENCES users (user_id),
    CONSTRAINT fk_dm_members_lastmsg FOREIGN KEY (last_read_message_id) REFERENCES dm_messages (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 끝. 총 20개 테이블.
-- 스토리(STORIES)는 부가 기능 확정 시 추가.
-- =====================================================================

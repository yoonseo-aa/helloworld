-- =====================================================================
-- 010. comments.like_count 추가 (댓글 좋아요 수 캐시)
--
-- 배경: 댓글 좋아요의 정본은 Redis(comment:like:count:{id})이고, comment_likes 테이블은
--       SQS Worker가 비동기로 채우는 백업이다. 댓글 목록에서 좋아요 수를 매번 COUNT 하지 않도록
--       posts.like_count 처럼 비정규화 카운트 캐시를 comments 에도 둔다.
--       (좋아요/취소 시 SQS Worker가 ±1 로 갱신. GREATEST(...,0)으로 음수 방지)
--
-- NOT NULL DEFAULT 0 이므로 기존 댓글 행은 0으로 채워진다(영향 없음).
--
-- 적용: 운영 DB / 각자 로컬 DB에 한 번씩 실행
-- 적용 상태:
--   [ ] 운영 DB
--   [ ] 각자 로컬 DB
-- =====================================================================

ALTER TABLE comments
    ADD COLUMN like_count INT NOT NULL DEFAULT 0
        COMMENT 'Redis 정본의 백업 캐시' AFTER is_deleted;

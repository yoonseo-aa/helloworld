-- =====================================================================
-- 006. post_likes 커서 페이지네이션용 복합 인덱스 추가
--
-- 배경: 좋아요 목록 조회 두 개가 모두 아래 형태다.
--         WHERE post_id = ? [AND like_id < ?] ORDER BY like_id DESC LIMIT ?
--         WHERE user_id = ? [AND like_id < ?] ORDER BY like_id DESC LIMIT ?
--
--       기존 인덱스로는 정렬을 인덱스로 받지 못해 filesort가 난다.
--         - uk_post_likes(post_id, user_id) → 두 번째가 user_id라 like_id 정렬 불가
--         - idx_post_likes_user(user_id)    → 단일 컬럼이라 동일
--
--       두 번째 컬럼을 like_id로 둔 복합 인덱스면 WHERE와 ORDER BY를 한 인덱스로
--       처리해 filesort가 사라지고, LIMIT만큼만 읽고 멈춘다.
--
-- idx_post_likes_user 제거에 대하여:
--   fk_post_likes_user 가 user_id 인덱스를 요구하지만, 새로 만드는
--   idx_post_likes_user_cursor(user_id, like_id)의 선두 컬럼이 user_id라
--   FK 요건을 그대로 만족한다. 그래서 반드시 "생성 후 제거" 순서로 실행한다.
--   순서를 바꾸면 MySQL이 FK 인덱스가 없다며 DROP을 거부한다(errno 150).
--
-- 데이터 변경은 없다. 인덱스만 바뀐다.
--
-- 적용: 운영 DB / 각자 로컬 DB에 한 번씩 실행
-- =====================================================================

ALTER TABLE post_likes
    ADD KEY idx_post_likes_post_cursor (post_id, like_id),
    ADD KEY idx_post_likes_user_cursor (user_id, like_id);

ALTER TABLE post_likes
    DROP KEY idx_post_likes_user;

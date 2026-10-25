-- 검색 파트: 검색어 자동저장 UPSERT를 원자적으로(동시 같은 검색어 → 1행) 하기 위한 UNIQUE 제약.
-- 이 제약이 있어야 INSERT ... ON DUPLICATE KEY UPDATE 가 (user_id, keyword, search_type) 중복을 흡수한다.
-- 콜레이션 utf8mb4_unicode_ci라 대소문자 무시 dedup(React/react 동일 취급).
-- ⚠️ 기존 데이터에 (user_id, keyword, search_type) 중복이 있으면 실패하므로, 먼저 중복 정리 후 적용.
ALTER TABLE search_histories
    ADD UNIQUE KEY uk_search_histories (user_id, keyword, search_type);

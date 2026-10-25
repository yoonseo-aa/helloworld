-- =====================================================================
-- 002. tags 마스터 데이터 시드 (초안)
--
-- 배경: tags는 마스터 테이블인데 schema.sql에는 CREATE TABLE만 있어서
--       비어 있으면 프로필의 관심태그 셀렉트 박스가 빈 목록으로 나온다.
--       (GET /api/tags → [], 프로필 저장 시 400 "존재하지 않는 태그")
--
-- ⚠️ 이 목록은 초안이다. 서비스에 실제로 노출할 태그는 팀에서 조정한다.
--    조정 시 이 파일을 수정하지 말고 003_ 파일을 새로 만들어 INSERT/UPDATE/DELETE 한다.
--    (이미 실행한 환경과 어긋나지 않게 하기 위함)
--
-- 적용 상태:
--   [x] 운영 서버(i15e204) — 2026-07-31 적용 완료
--   [ ] 각자 로컬 — 아래 실행 필요
--
-- 주의: 한글이 깨지지 않도록 utf8mb4 연결로 실행할 것.
--   docker exec -i helloworld-mysql mysql -uroot -p --default-character-set=utf8mb4 helloworld < 002_seed_tags.sql
-- =====================================================================

-- 이미 있는 태그는 건너뛴다(tag_name UNIQUE). 여러 번 실행해도 안전.
INSERT IGNORE INTO tags (tag_type, tag_name) VALUES
  -- 기술 스택
  ('TECH',     'Spring Boot'),
  ('TECH',     'React'),
  ('TECH',     'Redis'),
  ('TECH',     'MySQL'),
  ('TECH',     'Docker'),
  -- 관심 도메인
  ('DOMAIN',   'Backend'),
  ('DOMAIN',   'Frontend'),
  ('DOMAIN',   'AI'),
  ('DOMAIN',   'DevOps'),
  -- 포지션(직업)
  ('POSITION', '학생'),
  ('POSITION', '백엔드 개발자'),
  ('POSITION', '프론트엔드 개발자');

-- 확인용
-- SELECT tag_id, tag_type, tag_name FROM tags ORDER BY tag_type, tag_id;

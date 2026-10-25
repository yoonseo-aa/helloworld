-- 검색 파트: 게시물 본문(content) 부분검색용 ngram FULLTEXT 인덱스
-- MySQL 8 InnoDB. ngram_token_size 기본 2(bigram) → 2글자 이상 부분 문자열을 인덱스로 검색.
-- 쿼리는 MATCH(content) AGAINST('"kw"' IN BOOLEAN MODE) (따옴표=연속 부분일치).
-- 컬럼 변경이 아니라 인덱스 추가라 마스터 ERD 컬럼 정의는 그대로.
ALTER TABLE posts ADD FULLTEXT INDEX ft_posts_content (content) WITH PARSER ngram;

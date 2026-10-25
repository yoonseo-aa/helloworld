-- 좋아요 원자적 토글.
-- KEYS[1] = 좋아요 누른 사용자 Set 키 (예: post:like:users:{postId})
-- KEYS[2] = 좋아요 수 카운트 키 (예: post:like:count:{postId})
-- ARGV[1] = 요청자 userId
--
-- 반환: { liked(0 또는 1), count } — Lua 테이블(=배열)로 반환하면 RedisTemplate.execute가 List<Long>으로 받는다.
--
-- [학습 포인트] 왜 Lua 스크립트인가?
--  - "이미 좋아요 눌렀는지 확인 → 없으면 추가+카운트증가, 있으면 제거+카운트감소"를
--    애플리케이션 코드에서 SISMEMBER 하고 나서 SADD/INCR을 따로 호출하면, 그 사이에 다른 요청이
--    끼어들 수 있다(레이스 컨디션). Redis는 Lua 스크립트 전체를 원자적(단일 커맨드처럼)으로 실행하므로
--    "확인 + 반영"이 절대 쪼개지지 않는다.
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
    redis.call('SREM', KEYS[1], ARGV[1])
    local count = redis.call('DECR', KEYS[2])
    if count < 0 then
        redis.call('SET', KEYS[2], 0)
        count = 0
    end
    return {0, count}
else
    redis.call('SADD', KEYS[1], ARGV[1])
    local count = redis.call('INCR', KEYS[2])
    return {1, count}
end

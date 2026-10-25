-- =====================================================================
-- 004. dm_messages.client_message_id 추가 (중복 전송 방지)
--
-- 배경: 클라이언트가 만든 식별자를 저장할 곳이 없어 같은 메시지가 두 번
--       저장되는 것을 막을 수 없었다. 모바일에서 전송 중 신호가 끊기면
--       클라이언트가 재시도하는데, 서버는 이미 받았을 수 있다.
--
-- 사전 검사만으로는 동시·중복 요청을 막을 수 없다(채팅방 pair_key에서 확인).
-- 최종 보증은 DB UNIQUE 제약이 한다.
--
-- NULL을 허용하므로 기존 데이터에 영향이 없다.
-- MySQL UNIQUE는 NULL을 중복으로 보지 않아, client_message_id를 보내지 않는
-- 클라이언트도 계속 동작한다(그 경우 중복 방지는 되지 않는다).
--
-- 적용: 운영 DB / 각자 로컬 DB에 한 번씩 실행
-- =====================================================================

ALTER TABLE dm_messages
    ADD COLUMN client_message_id VARCHAR(64) NULL
        COMMENT '클라이언트 생성 식별자 (중복 전송 방지)' AFTER content,
    ADD UNIQUE KEY uk_dm_messages_client (room_id, sender_id, client_message_id);

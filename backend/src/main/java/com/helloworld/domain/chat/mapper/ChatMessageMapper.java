package com.helloworld.domain.chat.mapper;

import com.helloworld.domain.chat.entity.DmMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 채팅 메시지 DB 접근 (MyBatis). SQL은 resources/mapper/chat/ChatMessageMapper.xml.
 *
 * 커서는 created_at이 아니라 message_id를 쓴다.
 * created_at은 같은 초에 여러 건이 들어오면 순서가 흔들리고 경계에서 누락·중복이 생긴다.
 * message_id는 AUTO_INCREMENT라 단조 증가하므로 커서로 안전하다.
 */
@Mapper
public interface ChatMessageMapper {

    int insertMessage(DmMessage message);

    /**
     * client_message_id로 기존 메시지 조회 (<b>잠금 읽기</b>).
     *
     * 중복 전송으로 UNIQUE 충돌이 났을 때 이미 저장된 메시지를 되돌려주기 위한 재조회다.
     * REPEATABLE READ에서 일반 SELECT는 트랜잭션 시작 시점 스냅샷을 보므로
     * 동시 요청이 방금 커밋한 행이 보이지 않는다(null → 500).
     */
    DmMessage selectByClientMessageIdForShare(@Param("roomId") Long roomId,
                                             @Param("senderId") Long senderId,
                                             @Param("clientMessageId") String clientMessageId);

    /** 최신 메시지 N건 (초기 로드). message_id 내림차순. */
    List<DmMessage> selectLatest(@Param("roomId") Long roomId, @Param("size") int size);

    /** before보다 오래된 메시지 N건 (위로 스크롤). message_id 내림차순. */
    List<DmMessage> selectBefore(@Param("roomId") Long roomId,
                                 @Param("before") Long before,
                                 @Param("size") int size);

    /** after보다 새로운 메시지 N건 (재연결 후 갭 복구). message_id 오름차순. */
    List<DmMessage> selectAfter(@Param("roomId") Long roomId,
                               @Param("after") Long after,
                               @Param("size") int size);

    /** 해당 커서보다 오래된 메시지가 더 있는지 (has_more 판정용) */
    boolean existsOlderThan(@Param("roomId") Long roomId, @Param("messageId") Long messageId);

    /** 해당 커서보다 새로운 메시지가 더 있는지 */
    boolean existsNewerThan(@Param("roomId") Long roomId, @Param("messageId") Long messageId);

    /** 메시지 1건 조회 (삭제 권한 검사·읽음 커서 검증용). 방이 다르면 null */
    DmMessage selectInRoom(@Param("roomId") Long roomId, @Param("messageId") Long messageId);

    /**
     * soft delete. 이미 삭제된 것은 건드리지 않는다(deleted_at을 덮어써서 시각이 밀리는 것을 막는다).
     * @return 변경된 행 수. 0이면 이미 삭제됨
     */
    int softDelete(@Param("messageId") Long messageId);
}

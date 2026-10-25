package com.helloworld.domain.chat.mapper;

import com.helloworld.domain.chat.entity.ChatRoomCounterpart;
import com.helloworld.domain.chat.entity.ChatRoomMemberUnread;
import com.helloworld.domain.chat.entity.ChatRoomSummary;
import com.helloworld.domain.chat.entity.DmRoom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 채팅방 DB 접근 (MyBatis). SQL은 resources/mapper/chat/ChatRoomMapper.xml 에 작성.
 * 방(dm_rooms)과 참여자(dm_members) 등록을 담당한다. 메시지는 별도 매퍼에서 다룬다.
 */
@Mapper
public interface ChatRoomMapper {

    /** pair_key로 기존 DIRECT 방 조회 (없으면 null) */
    Long selectRoomIdByPairKey(@Param("pairKey") String pairKey);

    /**
     * pair_key로 기존 DIRECT 방을 <b>잠금 읽기</b>로 조회 (없으면 null).
     *
     * MySQL 기본 격리수준 REPEATABLE READ에서 일반 SELECT는 트랜잭션 시작 시점의 스냅샷을 읽는다.
     * 그래서 동시 요청이 방금 커밋한 행은 같은 트랜잭션 안에서 다시 조회해도 보이지 않는다.
     * FOR SHARE(잠금 읽기)는 최신 커밋 데이터를 읽으므로 이 상황에서만 사용한다.
     */
    Long selectRoomIdByPairKeyForShare(@Param("pairKey") String pairKey);

    /** 방 생성. 생성된 room_id는 파라미터 객체(roomId)에 채워진다. */
    int insertRoom(DmRoom room);

    /** 참여자 일괄 등록. 개설자는 OWNER, 나머지는 MEMBER. */
    int insertMembers(@Param("roomId") Long roomId,
                      @Param("ownerId") Long ownerId,
                      @Param("userIds") List<Long> userIds);

    /** 전달된 user_id 중 실제 존재하는 개수 (FK 오류 전 유효성 검증용) */
    int countExistingUserIds(@Param("userIds") List<Long> userIds);

    /** 해당 사용자가 방의 현재 참여자인지 (나간 사람은 제외) */
    boolean existsMember(@Param("roomId") Long roomId, @Param("userId") Long userId);

    /**
     * 읽음 위치 갱신. 뒤로 되돌아가지 않도록 현재 값보다 큰 경우에만 올린다.
     *
     * 읽음 이벤트는 순서가 뒤바뀌어 도착할 수 있다(재연결·네트워크 지연).
     * 조건 없이 덮어쓰면 오래된 이벤트가 나중에 도착해 안읽음 수가 되살아난다.
     *
     * @return 변경된 행 수. 0이면 이미 그 지점 이상을 읽은 상태
     */
    int updateLastReadMessageId(@Param("roomId") Long roomId,
                                @Param("userId") Long userId,
                                @Param("messageId") Long messageId);

    /**
     * 대화 목록. 마지막 메시지와 안읽음 수를 <b>한 번의 쿼리로</b> 함께 가져온다.
     *
     * 방마다 따로 조회하면 방 20개에 쿼리 41번(1 + 20 + 20)이 나간다.
     * 목록 화면은 접속마다 호출되므로 여기서 N+1이 나면 가장 아프다.
     */
    List<ChatRoomSummary> selectRoomSummaries(@Param("userId") Long userId,
                                              @Param("keyword") String keyword,
                                              @Param("beforeLastMessageId") Long beforeLastMessageId,
                                              @Param("beforeRoomId") Long beforeRoomId,
                                              @Param("size") int size);

    /** 목록에 표시할 상대방 정보. 방 목록을 받은 뒤 <b>한 번</b> 더 조회해 자바에서 묶는다(N+1 방지) */
    List<ChatRoomCounterpart> selectCounterparts(@Param("roomIds") List<Long> roomIds,
                                                 @Param("userId") Long userId);

    /** 전체 안읽음 합계 (앱 아이콘·헤더 뱃지용) */
    int selectTotalUnreadCount(@Param("userId") Long userId);

    /**
     * 한 방의 현재 참여자 전원과 <b>각자의</b> 안읽음 수.
     *
     * 개인 큐 갱신에 쓴다. 읽은 위치가 사람마다 다르므로 안읽음 수도 사람마다 다르고,
     * 참여자별로 따로 조회하면 단체방에서 N+1이 된다. 그래서 한 번에 받는다.
     */
    List<ChatRoomMemberUnread> selectMemberUnreadCounts(@Param("roomId") Long roomId);
}

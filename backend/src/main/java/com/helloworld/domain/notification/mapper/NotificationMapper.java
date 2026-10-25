package com.helloworld.domain.notification.mapper;

import com.helloworld.domain.notification.dto.response.NotificationResponse;
import com.helloworld.domain.notification.entity.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 알림 DB 접근 (MyBatis). SQL은 resources/mapper/notification/NotificationMapper.xml.
 */
@Mapper
public interface NotificationMapper {

    /**
     * 같은 알림이 이미 있는지 확인한다 (중복 방지용).
     *
     * <p>중복을 막는 이유: 좋아요·팔로우는 토글이라 취소하고 다시 누를 수 있다. 그때마다 알림이
     * 쌓이면 목록이 같은 사람의 같은 알림으로 도배된다. "A가 내 글에 좋아요"는 몇 번 눌렀든
     * 한 줄이면 된다.
     *
     * <p><b>확인과 {@link #insert}를 한 문장으로 합치지 않는다.</b>
     * {@code INSERT ... SELECT ... WHERE NOT EXISTS} 는 알림을 넣으면서 같은 테이블을 읽어
     * 공유 락을 잡고, 같은 사람에게 가는 알림이 동시에 들어오면 데드락이 난다 —
     * 10명 동시 좋아요에서 6건이 유실되는 것을 실제로 확인했다. 자세한 배경은 XML 주석에 적었다.
     */
    boolean existsSame(Notification notification);

    /**
     * 알림 생성. 중복 확인은 {@link #existsSame}으로 미리 한다.
     *
     * <p>생성된 id는 {@code notification.notificationId}에 채워진다(실시간 push에서 쓴다).
     */
    void insert(Notification notification);

    /**
     * 알림 목록 (최신순 커서 페이지네이션).
     *
     * <p>actor의 닉네임·프로필 이미지를 JOIN으로 함께 가져온다 — 목록마다 사용자 조회를 따로 하면
     * N+1이 된다. 화면에 "누가" 했는지가 알림의 핵심이라 이 조인은 항상 필요하다.
     *
     * @param unreadOnly true면 안 읽은 것만 (화면의 "읽지 않음" 버튼)
     * @param cursor     이 값보다 작은 notification_id (없으면 처음부터)
     */
    List<NotificationResponse> selectByRecipient(@Param("recipientId") Long recipientId,
                                                 @Param("unreadOnly") boolean unreadOnly,
                                                 @Param("cursor") Long cursor,
                                                 @Param("limit") int limit);

    /**
     * 단건 조회 (실시간 push 전용). 목록과 <b>같은 조각·같은 조인</b>을 쓰므로 형태가 갈리지 않는다.
     *
     * <p>목록 조회에 커서를 넣어 한 건만 꺼내는 방식(id+1)을 쓰지 않는 이유:
     * 그 방식은 "id가 정수라서 (id, id+1) 사이에 다른 행이 없다"는 성질에 의존한다.
     * 실제로 성립하지만(auto_increment offset을 바꿔도 정수는 정수다) 읽는 사람이 매번
     * 그 추론을 해야 한다. id로 직접 찾는 편이 의도가 그대로 드러난다.
     *
     * <p>{@code recipientId} 조건을 함께 두어 남의 알림이 잘못 실려 나가는 것을 구조적으로 막는다.
     */
    NotificationResponse selectOne(@Param("notificationId") Long notificationId,
                                   @Param("recipientId") Long recipientId);

    /** 안 읽은 알림 수 (뱃지용) */
    int countUnread(@Param("recipientId") Long recipientId);

    /**
     * 읽음 처리. <b>recipient_id 조건을 함께 두는 것이 권한 검사다</b> —
     * 남의 알림 id를 넣어도 조건에 걸려 0행이 되고, 조회를 한 번 더 하지 않아도 된다.
     *
     * @return 변경된 행 수. 0이면 없는 알림이거나 남의 알림이다
     */
    int markAsRead(@Param("notificationId") Long notificationId,
                   @Param("recipientId") Long recipientId);
}

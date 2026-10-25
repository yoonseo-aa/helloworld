package com.helloworld.domain.notification.service;

import com.helloworld.domain.notification.dto.response.NotificationResponse;
import com.helloworld.domain.notification.entity.Notification;
import com.helloworld.domain.notification.mapper.NotificationMapper;
import com.helloworld.global.common.CursorResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/**
 * 알림 생성·조회·읽음 처리.
 *
 * <p>알림은 세 가지 상황에서 생긴다 — 누가 나를 팔로우, 내 게시물에 좋아요, 내 게시물에 댓글.
 * 생성은 각 도메인(팔로우·좋아요·댓글)이 이 서비스를 불러서 하고, 조회·읽음은 알림 API가 담당한다.
 *
 * <p><b>생성 메서드가 예외를 던지지 않는 이유</b> — 알림은 부가 기능이다.
 * 팔로우 버튼을 눌렀는데 알림 저장이 실패해서 팔로우 자체가 500이 되면 사용자는 본 기능을 잃는다.
 * 그래서 생성·push 실패는 로그만 남기고 삼킨다.
 * (좋아요 SQS가 큐 없이 켜져 운영을 크래시 루프에 빠뜨린 사고에서 얻은 원칙 —
 *  부가 기능의 실패는 그 기능만 실패해야 한다)
 *
 * <p><b>이 클래스가 유일한 방어선이다.</b> 호출부 세 곳
 * ({@code FollowService.follow} · {@code PostLikeService.toggleLike} ·
 * {@code CommentService.createComment}) 어디에도 try-catch가 없다 —
 * 여기서 절대 예외를 내보내지 않는다는 약속에 기대고 있다.
 * 그중 <b>댓글만 트랜잭션 안</b>이라 아래 항목의 처리가 함께 필요하다.
 * 호출부마다 try-catch를 두면 방어가 여러 곳에 흩어져 한 곳을 빠뜨리기 쉽고,
 * "알림은 실패해도 된다"는 규칙이 호출부 개수만큼 반복된다.
 * 그래서 그 약속은 {@code NotificationServiceTest}가 직접 검증한다 —
 * 매퍼가 터져도, push가 터져도 이 클래스의 notify* 는 정상 반환해야 한다.
 *
 * <p><b>예외를 삼키는 것만으로는 부족하다.</b> 호출자가 트랜잭션 안이면(댓글이 그렇다)
 * 알림 INSERT가 데드락을 만났을 때 MySQL이 트랜잭션을 통째로 되돌려 본 기능까지 사라진다 —
 * 예외를 삼켜도 이미 늦다. 그래서 트랜잭션 안에서 부르면 <b>커밋 후로 미룬다</b>({@code create} 참고).
 *
 * <p>조회는 사용자가 직접 요청한 동작이라 실패를 숨기지 않는다(그대로 500이 나간다).
 * 읽음 처리는 예외를 던지지 않는데, 그 이유는 {@link #markAsRead}에 적었다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {

    public static final String TYPE_FOLLOW = "FOLLOW";
    public static final String TYPE_LIKE = "LIKE";
    public static final String TYPE_COMMENT = "COMMENT";

    /** 프론트가 이미 구독 중인 개인 큐. 채팅과 같은 주소를 payload 종류(type)로 나눠 쓴다 */
    private static final String UPDATES_QUEUE = "/queue/updates";

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 50;

    private final NotificationMapper notificationMapper;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 누가 나를 팔로우했다.
     *
     * @param recipientId 팔로우 당한 사람(알림 받는 쪽)
     * @param actorId     팔로우한 사람
     */
    public void notifyFollow(Long recipientId, Long actorId) {
        create(recipientId, actorId, TYPE_FOLLOW, null, null);
    }

    /**
     * 내 게시물에 좋아요가 눌렸다.
     *
     * @param recipientId 게시물 작성자
     * @param actorId     좋아요를 누른 사람
     */
    public void notifyPostLike(Long recipientId, Long actorId, Long postId) {
        create(recipientId, actorId, TYPE_LIKE, postId, null);
    }

    /**
     * 내 게시물에 댓글이 달렸다.
     *
     * <p>{@code CommentService.createComment()}가 호출한다. 그쪽은 {@code @Transactional}이라
     * 이 알림은 <b>커밋된 뒤에</b> 만들어진다({@link #create} 참고).
     *
     * <p>좋아요·팔로우와 달리 <b>중복이 걸러지지 않는다</b> — 댓글마다 {@code targetCommentId}가
     * 달라서 같은 사람이 댓글을 5개 쓰면 알림도 5건이다. 의도한 동작이다.
     * 댓글은 토글이 아니라 각각이 별개 사건이라 "몇 번 눌렀든 한 줄"이 성립하지 않는다.
     *
     * @param recipientId 게시물 작성자
     * @param actorId     댓글 쓴 사람
     */
    public void notifyPostComment(Long recipientId, Long actorId, Long postId, Long commentId) {
        create(recipientId, actorId, TYPE_COMMENT, postId, commentId);
    }

    /**
     * 알림 목록. 최신순이며 커서는 {@code notification_id}를 쓴다.
     *
     * @param unreadOnly 화면의 "읽지 않음" 버튼. false면 전체
     */
    @Transactional(readOnly = true)
    public CursorResponse<NotificationResponse> getNotifications(Long userId, boolean unreadOnly,
                                                                Long cursor, Integer size) {
        int limit = normalizeSize(size);
        List<NotificationResponse> fetched =
                notificationMapper.selectByRecipient(userId, unreadOnly, cursor, limit + 1);
        return CursorResponse.of(fetched, limit, NotificationResponse::getNotificationId);
    }

    /** 안 읽은 알림 수 (뱃지용) */
    @Transactional(readOnly = true)
    public int getUnreadCount(Long userId) {
        return notificationMapper.countUnread(userId);
    }

    /**
     * 알림 하나를 읽음으로 표시한다. <b>0행이어도 성공으로 둔다.</b>
     *
     * <p>0행이 나오는 경우는 세 가지다 — 이미 읽음 / 없는 알림 / 남의 알림.
     * 셋을 구분하지 않는 이유가 각각 있다.
     * <ul>
     *   <li><b>이미 읽음</b>은 잘못된 요청이 아니다. 알림을 눌러 화면을 이동하면서 보내는 요청이라
     *       중복 호출이 흔하다. 여기에 오류를 주면 프론트가 무해한 실패를 처리해야 한다.</li>
     *   <li><b>남의 알림</b>이라고 알려주면 id를 바꿔 넣어보며 남의 알림 존재 여부를 알아낼 수 있다.
     *       "권한 없음"과 "없음"을 구분하지 않는 것이 그 탐색을 막는다.</li>
     * </ul>
     * 권한 검사는 UPDATE의 {@code recipient_id} 조건이 담당한다 — 남의 알림은 조건에 걸려
     * 절대 변경되지 않으므로, 성공으로 응답해도 실제로 바뀐 것은 없다.
     */
    @Transactional
    public void markAsRead(Long userId, Long notificationId) {
        if (notificationMapper.markAsRead(notificationId, userId) == 0) {
            log.debug("읽음 처리 대상 없음 — 이미 읽음이거나 본인 알림이 아님 (notificationId={}, userId={})",
                    notificationId, userId);
        }
    }

    /**
     * 알림 생성 진입점. 자기 자신에게 가는 알림은 만들지 않고,
     * <b>호출자가 트랜잭션 안이면 커밋된 뒤로 미룬다.</b>
     *
     * <p>자기 알림을 걸러내는 이유: 내 글에 내가 좋아요를 누르면 "내가 내 글을 좋아합니다"가
     * 알림으로 온다. 팔로우는 자기 자신을 팔로우할 수 없어(CANNOT_FOLLOW_SELF) 여기 오지 않지만,
     * 좋아요·댓글은 자기 것에 할 수 있다.
     *
     * <p><b>커밋 후로 미루는 이유</b> — 호출자의 트랜잭션 안에서 알림을 만들면
     * "알림 실패가 본 기능을 깨지 않는다"는 이 클래스의 약속이 성립하지 않는다.
     * <ul>
     *   <li>알림 INSERT가 데드락을 만나면 <b>MySQL이 트랜잭션 전체를 되돌린다</b>.
     *       예외를 삼켜도 이미 롤백된 뒤라 <b>댓글 자체가 사라진다</b>.
     *       (댓글은 좋아요·팔로우와 달리 {@code @Transactional} 안에서 알림을 부른다)</li>
     *   <li>실시간 push는 네트워크 I/O다. 커밋 전에 하면 호출자가 잡은 행 락
     *       (예: {@code posts.comment_count} UPDATE)을 쥔 채로 기다리게 된다.</li>
     *   <li>커밋 전에 보내면 <b>롤백된 일도 알림으로 나간다</b> — 없는 댓글의 알림이 뜬다.</li>
     * </ul>
     * 트랜잭션이 없으면(팔로우·좋아요) 그대로 즉시 만든다.
     */
    private void create(Long recipientId, Long actorId, String type,
                        Long targetPostId, Long targetCommentId) {
        if (recipientId == null || actorId == null || recipientId.equals(actorId)) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    doCreate(recipientId, actorId, type, targetPostId, targetCommentId);
                }
            });
            return;
        }
        doCreate(recipientId, actorId, type, targetPostId, targetCommentId);
    }

    /** 실제 생성. 여기서는 어떤 예외도 밖으로 내보내지 않는다 */
    private void doCreate(Long recipientId, Long actorId, String type,
                          Long targetPostId, Long targetCommentId) {
        try {
            Notification notification = Notification.builder()
                    .recipientId(recipientId)
                    .actorId(actorId)
                    .type(type)
                    .targetPostId(targetPostId)
                    .targetCommentId(targetCommentId)
                    .build();

            // 같은 알림이 이미 있으면 만들지 않는다 — 새로 생긴 것이 아니므로 push도 하지 않는다.
            // (좋아요를 취소하고 다시 눌러도 알림이 다시 뜨지 않는다)
            //
            // 확인과 INSERT를 나누는 이유는 데드락이다. 한 문장으로 합치면(INSERT ... SELECT ...
            // WHERE NOT EXISTS) 같은 사람에게 가는 알림이 동시에 들어올 때 서로의 락을 기다려
            // 데드락이 나고, 이 클래스가 예외를 삼키므로 알림이 조용히 유실된다.
            // 그 대가로 여기에 경쟁 구간이 남는다 — 같은 알림이 동시에 들어오면 중복될 수 있다.
            // 순차 요청은 정확히 1건이고, 중복은 한 줄 더 보이는 것뿐이라 유실보다 가볍다.
            // (자세한 배경과 완전히 막는 방법은 NotificationMapper.xml 주석에 적었다)
            if (notificationMapper.existsSame(notification)) {
                return;
            }
            notificationMapper.insert(notification);
            push(recipientId, notification.getNotificationId());
        } catch (Exception e) {
            // 알림은 부가 기능이다. 여기서 예외가 나가면 팔로우·좋아요 같은 본 기능이 실패한다.
            log.warn("알림 생성 실패 (recipientId={}, actorId={}, type={})",
                    recipientId, actorId, type, e);
        }
    }

    /**
     * 실시간 push. 방금 만든 알림을 다시 읽어 actor 정보까지 채워 보낸다.
     *
     * <p>다시 읽는 이유: 화면에 필요한 것은 "누가"이고 그 닉네임·프로필 이미지는 users 테이블에 있다.
     * INSERT 결과에는 그 값이 없어서, 목록 조회와 같은 쿼리로 한 건만 읽어 형태를 일치시킨다.
     * 목록과 push가 같은 DTO라 프론트가 분기 없이 렌더링할 수 있다.
     *
     * <p>push 실패도 삼킨다 — 접속 중이 아니면 보낼 곳이 없는 것이 정상이고,
     * 알림은 DB에 남아 있어 다음 조회에서 보인다.
     */
    private void push(Long recipientId, Long notificationId) {
        try {
            NotificationResponse one = notificationMapper.selectOne(notificationId, recipientId);
            if (one == null) {
                return;
            }
            messagingTemplate.convertAndSendToUser(
                    String.valueOf(recipientId), UPDATES_QUEUE,
                    NotificationPushEvent.of(one, notificationMapper.countUnread(recipientId)));
        } catch (Exception e) {
            log.warn("알림 실시간 전송 실패 (recipientId={}, notificationId={})",
                    recipientId, notificationId, e);
        }
    }

    private int normalizeSize(Integer size) {
        if (size == null || size <= 0) {
            return DEFAULT_SIZE;
        }
        return Math.min(size, MAX_SIZE);
    }
}

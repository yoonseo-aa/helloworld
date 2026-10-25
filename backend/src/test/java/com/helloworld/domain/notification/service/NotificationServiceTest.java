package com.helloworld.domain.notification.service;

import com.helloworld.domain.notification.dto.response.NotificationResponse;
import com.helloworld.domain.notification.mapper.NotificationMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 알림 생성의 <b>내결함성</b>과 생성 규칙 검증.
 *
 * <p>왜 이 테스트가 중요한가: 호출하는 쪽(FollowService·PostLikeService)에는 try-catch가 없다.
 * "알림 서비스는 예외를 내보내지 않는다"는 약속에 기대고 있어서, 그 약속이 깨지면
 * <b>팔로우·좋아요 버튼이 500으로 실패한다</b>. 약속을 코드로 고정해 둔다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NotificationServiceTest {

    private static final Long RECIPIENT_ID = 1L;
    private static final Long ACTOR_ID = 2L;
    private static final Long POST_ID = 10L;

    @Mock
    private NotificationMapper notificationMapper;
    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private NotificationService notificationService;

    @Test
    @DisplayName("매퍼가 터져도 알림 생성은 예외를 내보내지 않는다 (팔로우·좋아요가 깨지면 안 된다)")
    void notify_whenMapperThrows_doesNotPropagate() {
        willThrow(new DataAccessResourceFailureException("DB 연결 끊김"))
                .given(notificationMapper).insert(any());

        assertThatCode(() -> notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID))
                .doesNotThrowAnyException();
        assertThatCode(() -> notificationService.notifyPostLike(RECIPIENT_ID, ACTOR_ID, POST_ID))
                .doesNotThrowAnyException();
        assertThatCode(() -> notificationService.notifyPostComment(RECIPIENT_ID, ACTOR_ID, POST_ID, 5L))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("실시간 전송이 터져도 예외를 내보내지 않는다 (알림은 DB에 남아 다음 조회에서 보인다)")
    void notify_whenPushThrows_doesNotPropagate() {
        given(notificationMapper.existsSame(any())).willReturn(false);
        given(notificationMapper.selectOne(any(), any())).willReturn(new NotificationResponse());
        willThrow(new MessagingException("브로커 없음"))
                .given(messagingTemplate).convertAndSendToUser(any(), any(), any());

        assertThatCode(() -> notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID))
                .doesNotThrowAnyException();

        // 전송을 실제로 시도했는지까지 확인한다 — 시도조차 안 하면 이 테스트는 아무것도 증명하지 못한다
        verify(messagingTemplate).convertAndSendToUser(any(), any(), any());
    }

    @Test
    @DisplayName("자기 자신에게는 알림을 만들지 않는다 (내 글에 내가 좋아요)")
    void notify_whenActorIsRecipient_skips() {
        notificationService.notifyPostLike(RECIPIENT_ID, RECIPIENT_ID, POST_ID);

        verifyNoInteractions(notificationMapper);
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("이미 같은 알림이 있으면 만들지도, 실시간 전송하지도 않는다")
    void notify_whenDuplicate_doesNotInsertNorPush() {
        given(notificationMapper.existsSame(any())).willReturn(true);

        notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID);

        verify(notificationMapper, never()).insert(any());
        verify(notificationMapper, never()).selectOne(any(), any());
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    @DisplayName("중복 확인과 INSERT는 별개 호출이다 — 한 문장으로 합치면 동시 요청에서 데드락으로 알림이 유실된다")
    void notify_checksThenInserts_separately() {
        given(notificationMapper.existsSame(any())).willReturn(false);

        notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID);

        InOrder order = inOrder(notificationMapper);
        order.verify(notificationMapper).existsSame(any());
        order.verify(notificationMapper).insert(any());
    }

    @Test
    @DisplayName("새로 생겼으면 실시간 전송한다 — 안읽음 합계를 함께 싣는다")
    void notify_whenCreated_pushesWithUnreadCount() {
        given(notificationMapper.existsSame(any())).willReturn(false);
        given(notificationMapper.selectOne(any(), any())).willReturn(new NotificationResponse());
        given(notificationMapper.countUnread(RECIPIENT_ID)).willReturn(3);

        notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID);

        verify(messagingTemplate).convertAndSendToUser(
                org.mockito.ArgumentMatchers.eq(String.valueOf(RECIPIENT_ID)),
                org.mockito.ArgumentMatchers.eq("/queue/updates"),
                org.mockito.ArgumentMatchers.argThat(payload ->
                        payload instanceof NotificationPushEvent event
                                && "NOTIFICATION".equals(event.getType())
                                && event.getUnreadCount() == 3));
    }

    @Test
    @DisplayName("트랜잭션 안에서 부르면 커밋 전에는 아무것도 하지 않는다 (댓글 작성이 알림 때문에 죽지 않게)")
    void notify_inTransaction_deferredUntilAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            notificationService.notifyPostComment(RECIPIENT_ID, ACTOR_ID, POST_ID, 5L);

            // 커밋 전 — DB를 건드리지 않았어야 한다. 여기서 데드락이 나면 호출자의 트랜잭션이
            // 통째로 롤백되어 댓글 자체가 사라진다.
            verifyNoInteractions(notificationMapper);
            verifyNoInteractions(messagingTemplate);
            assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);

            // 커밋 시점을 흉내 낸다
            TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

            verify(notificationMapper).existsSame(any());
            verify(notificationMapper).insert(any());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    @DisplayName("트랜잭션이 롤백되면 알림도 생기지 않는다 (없는 댓글의 알림이 뜨면 안 된다)")
    void notify_whenTransactionRollsBack_neverCreated() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            notificationService.notifyPostComment(RECIPIENT_ID, ACTOR_ID, POST_ID, 5L);
            // 롤백 = afterCommit이 불리지 않는다
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verifyNoInteractions(notificationMapper);
    }

    @Test
    @DisplayName("트랜잭션이 없으면(팔로우·좋아요) 그 자리에서 만든다")
    void notify_withoutTransaction_createsImmediately() {
        given(notificationMapper.existsSame(any())).willReturn(false);

        notificationService.notifyFollow(RECIPIENT_ID, ACTOR_ID);

        verify(notificationMapper).insert(any());
    }

    @Test
    @DisplayName("읽음 처리는 대상이 없어도(0행) 예외를 던지지 않는다")
    void markAsRead_whenNoRowAffected_doesNotThrow() {
        given(notificationMapper.markAsRead(anyLong(), anyLong())).willReturn(0);

        assertThatCode(() -> notificationService.markAsRead(RECIPIENT_ID, 999L))
                .doesNotThrowAnyException();
    }
}

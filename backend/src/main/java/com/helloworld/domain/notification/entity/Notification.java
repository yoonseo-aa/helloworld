package com.helloworld.domain.notification.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 알림 한 건 (notifications 테이블).
 *
 * <p>세 종류만 있다 — 누가 나를 팔로우, 내 게시물에 좋아요, 내 게시물에 댓글.
 * 알림은 "누가(actor) 나에게(recipient) 무엇을(type + target)" 했는지의 기록이다.
 *
 * <p>{@code targetPostId} / {@code targetCommentId}가 nullable인 이유: 종류마다 대상이 다르다.
 * FOLLOW는 대상이 사람이라 둘 다 null이고, LIKE는 게시물만, COMMENT는 둘 다 채워진다.
 */
@Getter
@NoArgsConstructor
public class Notification {

    private Long notificationId;
    private Long recipientId;
    private Long actorId;
    private String type;              // FOLLOW, LIKE, COMMENT
    private Long targetPostId;
    private Long targetCommentId;

    /**
     * primitive {@code boolean}이 아니라 래퍼 {@code Boolean}인 이유는
     * 응답 DTO({@code NotificationResponse.isRead})와 같다 — Lombok 게터 이름 때문에
     * JSON이 {@code read}로 나가는 것을 막는다. 엔티티는 응답에 직접 노출하지 않지만
     * 필드 이름을 일치시켜 두면 매핑에서 헷갈리지 않는다.
     */
    private Boolean isRead;

    @Builder
    public Notification(Long recipientId, Long actorId, String type,
                        Long targetPostId, Long targetCommentId) {
        this.recipientId = recipientId;
        this.actorId = actorId;
        this.type = type;
        this.targetPostId = targetPostId;
        this.targetCommentId = targetCommentId;
    }
}

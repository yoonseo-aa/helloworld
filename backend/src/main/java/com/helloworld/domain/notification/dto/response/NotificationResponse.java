package com.helloworld.domain.notification.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 알림 한 건. 목록 조회 응답의 원소이자 실시간 push payload에도 같은 형태로 쓴다.
 *
 * <p>같은 DTO를 쓰는 이유: 프론트가 목록으로 받은 알림과 실시간으로 받은 알림을 같은 코드로
 * 렌더링할 수 있다. 형태가 다르면 분기가 늘고 실수가 생긴다(채팅 메시지에서 같은 판단을 했다).
 *
 * <p><b>actor 정보를 평평하게 두는 이유</b>: 좋아요한 게시물 목록({@code LikedPostResponse})이
 * 이미 {@code author_id} / {@code author_nickname} / {@code author_profile_image_url} 형태로
 * 내려가고 있어 프론트가 그 모양을 다루고 있다. 굳이 중첩 객체로 바꿔 형태를 두 가지로 만들지 않는다.
 *
 * <p>{@code actor_nickname}이 화면에 보이는 핸들이다(프로필 생성 때 정한 닉네임, UNIQUE).
 */
@Getter
@NoArgsConstructor
public class NotificationResponse {

    private Long notificationId;

    /** FOLLOW, LIKE, COMMENT */
    private String type;

    /**
     * primitive {@code boolean}이면 Lombok 게터가 {@code isRead()}가 되고 Jackson이 {@code is}를
     * 떼어 JSON이 {@code read}로 나간다. 규약({@code is_liked}/{@code is_following})과 어긋나므로
     * 래퍼 {@code Boolean}으로 둬서 {@code is_read}가 되게 한다.
     */
    private Boolean isRead;

    /**
     * 알림을 눌렀을 때 어디로 갈지. 종류마다 채워지는 값이 다르다.
     * FOLLOW는 둘 다 없고(상대 프로필로 가면 된다), LIKE는 게시물만, COMMENT는 둘 다 있다.
     * 값이 없으면 전역 설정(non_null)으로 <b>필드 자체가 응답에서 빠진다.</b>
     */
    private Long targetPostId;
    private Long targetCommentId;

    private LocalDateTime createdAt;

    /** 알림을 발생시킨 사람 */
    private Long actorId;
    private String actorNickname;
    private String actorProfileImageUrl;
}

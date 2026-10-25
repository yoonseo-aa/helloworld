package com.helloworld.domain.comment.dto.response;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 댓글 단건 응답 (목록의 각 항목).
 *
 * [학습 포인트] isMine 필드
 *  - DB에서 오는 값이 아니라, 조회한 뒤 Service가 "로그인한 사용자 == 작성자"인지 계산해 채운다.
 *  - 프론트가 수정/삭제 버튼을 보여줄지 판단하는 데 쓴다. 실제 권한 검증은 서버가 다시 하므로
 *    이 값은 어디까지나 UI 힌트일 뿐이다(클라이언트를 신뢰하지 않는다).
 *
 * [학습 포인트] Boolean(래퍼) vs boolean(원시)
 *  - 원시 boolean이면 Lombok이 isMine() 게터를 만들고 Jackson은 프로퍼티명을 "mine"으로 인식해
 *    JSON 키가 is_mine이 아니라 mine으로 나간다.
 *  - 래퍼 Boolean이면 getIsMine()이 생성되어 의도대로 is_mine으로 직렬화된다.
 */
@Getter
@Setter
@NoArgsConstructor
public class CommentResponse {

    private Long commentId;
    private String content;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** 작성자 요약 (MyBatis <association>으로 매핑) */
    private CommentAuthorResponse author;

    /** 로그인 사용자가 이 댓글의 작성자인지 (Service가 채움) */
    private Boolean isMine;

    /** 이 댓글의 좋아요 수. Redis 정본에서 배치로 읽어 Service가 채운다. */
    private Long likeCount;

    /**
     * 로그인 사용자가 이 댓글에 좋아요를 눌렀는지. Redis 정본에서 배치로 읽어 Service가 채운다.
     * (isMine과 같은 이유로 primitive boolean이 아닌 Boolean 래퍼 — JSON 키를 is_liked로 내보내기 위함)
     */
    private Boolean isLiked;
}

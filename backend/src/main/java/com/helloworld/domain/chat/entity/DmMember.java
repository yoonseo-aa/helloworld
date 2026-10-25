package com.helloworld.domain.chat.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * dm_members 테이블 매핑 객체 (마스터 ERD 기준). 방의 '참여자(멤버십)'를 나타낸다.
 *
 * 참여자 = DB 행. 방 생성 시 자동 등록되고 나가기 전까지 영구히 남는다.
 * 대화 목록에 방이 뜨는 근거이자 과거 메시지 조회 권한의 기준.
 * (실시간 수신 등록인 '구독'과는 별개 개념 — 구독은 연결 위에만 존재)
 *
 * lastReadMessageId: 읽음 처리 기준. 안읽음 수 = 이 ID보다 큰 상대 메시지 개수.
 * leftAt: 나가기는 soft 처리. NULL이면 참여 중.
 */
@Getter
@Setter
@NoArgsConstructor
public class DmMember {

    private Long memberId;
    private Long roomId;
    private Long userId;
    private String memberRole;          // OWNER, MEMBER
    private Long lastReadMessageId;     // 읽음 처리 / 안읽음 카운트 기준
    private LocalDateTime joinedAt;
    private LocalDateTime leftAt;       // NULL=참여중
}

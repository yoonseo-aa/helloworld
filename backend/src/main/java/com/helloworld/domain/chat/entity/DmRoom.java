package com.helloworld.domain.chat.entity;

import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * dm_rooms 테이블 매핑 객체 (마스터 ERD 기준).
 * MyBatis가 resultType으로 매핑하므로 기본 생성자 + setter 필요.
 *
 * pairKey: DIRECT(1:1) 방의 중복 생성을 막는 키. 두 user_id를 정렬해 "작은ID_큰ID" 형태로 만든다.
 *          UNIQUE 제약이 걸려 있어 동시 요청에서도 방이 두 개 생기지 않는다.
 *          GROUP 방은 NULL (인원 조합이 가변이라 키로 못 묶음).
 */
@Getter
@Setter
@NoArgsConstructor
public class DmRoom {

    private Long roomId;
    private String roomType;      // DIRECT, GROUP
    private String title;         // 그룹방명 (DIRECT은 NULL)
    private Long createdBy;       // 개설자
    private String pairKey;       // DIRECT 중복방 방지 (minId_maxId), GROUP은 NULL
    private LocalDateTime createdAt;

    @Builder
    public DmRoom(String roomType, String title, Long createdBy, String pairKey) {
        this.roomType = roomType;
        this.title = title;
        this.createdBy = createdBy;
        this.pairKey = pairKey;
    }
}

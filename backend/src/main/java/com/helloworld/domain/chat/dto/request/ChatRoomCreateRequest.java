package com.helloworld.domain.chat.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Getter;

import java.util.List;

/**
 * 채팅방 생성/재사용 요청.
 * JSON은 snake_case로 들어온다 (target_user_ids). Jackson 전역 설정으로 매핑.
 *
 * 원소 1개면 DIRECT(1:1), 2개 이상이면 GROUP으로 만든다.
 * 현재 UI 흐름은 1명 선택이지만 구조는 인원수와 무관하게 둔다.
 */
@Getter
public class ChatRoomCreateRequest {

    @NotEmpty(message = "대화 상대를 한 명 이상 지정해야 합니다.")
    private List<Long> targetUserIds;
}

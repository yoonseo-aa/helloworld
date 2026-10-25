package com.helloworld.domain.notification.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;

/**
 * 알림 상태 변경 요청. 지금은 "읽음으로 만들기"만 지원한다.
 *
 * <p>본문으로 받는 이유: URL에 동사를 넣지 않는 규약을 지키면서 "무엇을 바꾸는지"를 표현하려면
 * 바꿀 상태를 본문에 담는 것이 자연스럽다({@code PATCH /api/notifications/{id}}).
 *
 * <p>{@code false}를 거부하는 이유: 안 읽음으로 되돌리는 기능은 요구사항에 없고 구현도 없다.
 * 조용히 무시하면 프론트는 성공했다고 믿고 화면을 되돌리는데 서버 상태는 그대로여서 어긋난다.
 * 지원하지 않는다는 것을 400으로 분명히 알려준다. 나중에 필요해지면 이 검증을 풀고
 * 서비스에 해제 경로를 추가하면 된다 — URL은 그대로 쓸 수 있다.
 */
@Getter
public class NotificationUpdateRequest {

    @NotNull(message = "is_read는 필수입니다.")
    @AssertTrue(message = "읽음 해제(is_read=false)는 지원하지 않습니다.")
    private Boolean isRead;
}

package com.helloworld.domain.user.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Getter;

import java.util.List;

/**
 * 프로필 생성/설정 요청.
 * 모든 필드가 선택(작성한 내용이 없어도 완료 가능)이다.
 * JSON은 snake_case로 들어온다(profile_image_url, interest_tag_ids ...).
 *
 * 저장 매핑:
 *  - nickname / profile_image_url / introduce → users 컬럼 업데이트
 *  - interest_tag_ids → user_interests(N:M) 일괄 저장 (관심 기술스택/도메인/직업 태그 통합)
 */
@Getter
public class ProfileCreateRequest {

    @Size(max = 30, message = "닉네임은 30자 이하여야 합니다.")
    private String nickname;

    private String profileImageUrl;

    @Size(max = 255, message = "한줄소개는 255자 이하여야 합니다.")
    private String introduce;

    /** 관심 기술스택/도메인/직업 태그 id 목록 (tags.tag_id). 셀렉트 박스에서 선택된 값. */
    private List<Long> interestTagIds;
}

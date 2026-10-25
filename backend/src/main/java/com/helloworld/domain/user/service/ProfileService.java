package com.helloworld.domain.user.service;

import com.helloworld.domain.tag.dto.response.TagResponse;
import com.helloworld.domain.user.dto.request.ProfileCreateRequest;
import com.helloworld.domain.user.dto.response.ProfileResponse;
import com.helloworld.domain.user.mapper.ProfileMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 프로필 설정 비즈니스 로직. 트랜잭션 경계는 이 계층에만 둔다.
 *
 * 요구사항: 모든 입력이 선택(작성 내용 없어도 완료 가능).
 * 프로필 정보(닉네임/사진/한줄소개)는 users 갱신, 관심 태그는 user_interests(N:M) 교체 저장.
 */
@Service
@RequiredArgsConstructor
public class ProfileService {

    private final ProfileMapper profileMapper;

    /** 현재 로그인 사용자의 프로필을 저장한다. */
    @Transactional
    public ProfileResponse createProfile(Long userId, ProfileCreateRequest request) {
        // 공백뿐인 닉네임은 '미입력'으로 취급한다.
        // nickname은 UNIQUE라서 빈 문자열을 그대로 저장하면 두 번째 사용자부터 제약 위반이 된다.
        String nickname = StringUtils.hasText(request.getNickname()) ? request.getNickname() : null;

        // 1) 닉네임이 있으면 중복 검사(본인 제외) — 대부분의 중복을 여기서 걸러 친절한 메시지를 준다
        if (nickname != null && profileMapper.existsNicknameByOther(nickname, userId)) {
            throw new BusinessException(ErrorCode.USER_DUPLICATE_NICKNAME);
        }

        // 2) 전달된 프로필 필드만 갱신 (null은 건드리지 않음)
        //    검사(1)와 저장(2) 사이에 다른 사용자가 같은 닉네임을 저장할 수 있다(TOCTOU).
        //    유일성의 최종 보장은 DB의 uk_users_nickname 제약이므로,
        //    충돌 시 500이 아니라 409(USER_DUPLICATE_NICKNAME)로 응답한다.
        try {
            profileMapper.updateProfile(userId,
                    nickname, request.getProfileImageUrl(), request.getIntroduce());
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ErrorCode.USER_DUPLICATE_NICKNAME);
        }

        // 3) 관심 태그 교체 저장 (제공된 경우에만)
        if (request.getInterestTagIds() != null) {
            saveInterests(userId, request.getInterestTagIds());
        }

        return ProfileResponse.of(userId);
    }

    /**
     * 사용자의 관심 태그 목록을 조회한다. 편집 화면이 기존 선택을 복원하는 데 쓴다.
     * 본인 여부는 보지 않는다(타인 프로필에서도 조회). 항목이 없으면 빈 목록.
     */
    @Transactional(readOnly = true)
    public List<TagResponse> getInterests(Long userId) {
        return profileMapper.selectInterestTags(userId).stream()
                .map(TagResponse::from)
                .toList();
    }

    /** 관심사(user_interests)를 요청 값으로 교체한다. 중복 tag_id는 제거. */
    private void saveInterests(Long userId, List<Long> rawTagIds) {
        // 중복/널 제거
        List<Long> tagIds = rawTagIds.stream()
                .filter(id -> id != null)
                .distinct()
                .toList();

        // 존재하지 않는 tag_id가 섞여 있으면 거부 (FK 오류로 인한 500 방지)
        if (!tagIds.isEmpty()) {
            int existing = profileMapper.countExistingTagIds(tagIds);
            if (existing != tagIds.size()) {
                throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM, "존재하지 않는 태그가 포함되어 있습니다.");
            }
        }

        // 교체: 기존 삭제 후 재삽입
        profileMapper.deleteUserInterests(userId);
        if (!CollectionUtils.isEmpty(tagIds)) {
            profileMapper.insertUserInterests(userId, tagIds);
        }
    }
}

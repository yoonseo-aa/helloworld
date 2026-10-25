package com.helloworld.domain.user.service;

import com.helloworld.domain.user.dto.request.UserCreateRequest;
import com.helloworld.domain.user.dto.response.UserResponse;
import com.helloworld.domain.user.entity.User;
import com.helloworld.domain.user.mapper.UserMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import com.helloworld.global.util.EmailLoginGuide;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Optional;

/**
 * 회원 비즈니스 로직. 트랜잭션 경계는 이 계층에만 둔다.
 * Controller는 이 Service만 호출하고, 이 Service는 Mapper만 호출한다.
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    /** 회원 가입 */
    @Transactional
    public UserResponse register(UserCreateRequest request) {
        // 이메일 중복 검증 — 기존 계정의 가입 수단에 맞는 로그인 방법을 안내한다.
        User existing = userMapper.selectByEmail(request.getEmail()).orElse(null);
        if (existing != null) {
            throw new BusinessException(ErrorCode.USER_DUPLICATE_EMAIL,
                    EmailLoginGuide.messageFor(existing.getAuthProvider()));
        }

        User user = User.builder()
                .authProvider("LOCAL")
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword())) // 단방향 해싱
                .build(); // 닉네임은 이후 '프로필 생성' 단계에서 설정 (가입 시엔 email+password만)

        userMapper.insertUser(user); // insert 후 user.userId 채워짐
        return UserResponse.from(user);
    }

    /** 회원 단건 조회 */
    @Transactional(readOnly = true)
    public UserResponse getUser(Long userId) {
        User user = userMapper.selectById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
        return UserResponse.from(user);
    }

    /**
     * 프로필에 등록된 GitHub 사용자명.
     *
     * <p>{@code UserResponse}에는 이 값이 없다 — 프로필 응답에 노출할 이유가 없어서다.
     * 저장소 목록처럼 이 값이 꼭 필요한 곳만 여기로 꺼내 간다.
     *
     * @return 등록하지 않았으면 비어 있음
     */
    @Transactional(readOnly = true)
    public Optional<String> findGithubUsername(Long userId) {
        return userMapper.selectById(userId)
                .map(User::getGithubUsername)
                .filter(StringUtils::hasText);
    }

    /** 존재하지 않으면 USER_NOT_FOUND. 엔티티/DTO 로딩 없이 존재만 검증한다(그리드 등 조회 전처리용). */
    @Transactional(readOnly = true)
    public void ensureExists(Long userId) {
        if (!userMapper.existsById(userId)) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
    }

    /** 이메일 중복 여부 */
    @Transactional(readOnly = true)
    public boolean isEmailAvailable(String email) {
        return !userMapper.existsByEmail(email);
    }
}

package com.helloworld.domain.user.mapper;

import com.helloworld.domain.user.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Optional;

/**
 * User DB 접근 (MyBatis). SQL은 resources/mapper/user/UserMapper.xml 에 작성.
 * namespace가 이 인터페이스 FQCN과 일치해야 한다.
 */
@Mapper
public interface UserMapper {

    // 단건 조회
    Optional<User> selectById(@Param("userId") Long userId);

    // 존재 여부 (엔티티 로딩 없이 확인 — 예: 그리드 조회의 대상 유저 검증)
    boolean existsById(@Param("userId") Long userId);

    Optional<User> selectByEmail(@Param("email") String email);

    // 소셜 계정 조회 (auth_provider + social_id)
    Optional<User> selectBySocial(@Param("authProvider") String authProvider,
                                  @Param("socialId") String socialId);

    // 이메일 존재 여부 (중복 확인)
    boolean existsByEmail(@Param("email") String email);

    // 등록
    int insertUser(User user);

    // 비밀번호 재설정: 해시된 새 비밀번호로 갱신
    int updatePassword(@Param("userId") Long userId, @Param("password") String password);
}

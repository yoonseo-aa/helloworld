package com.helloworld.domain.user.mapper;

import com.helloworld.domain.tag.entity.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 프로필 DB 접근 (MyBatis). SQL은 resources/mapper/user/ProfileMapper.xml 에 작성.
 * 회원 인증/조회는 UserMapper가 담당하고, 이 매퍼는 프로필 설정(users 일부 컬럼 갱신 +
 * 관심사 N:M user_interests)만 다룬다.
 */
@Mapper
public interface ProfileMapper {

    /** 닉네임 중복 여부 (본인 제외). 다른 사용자가 이미 쓰는 닉네임인지 확인 */
    boolean existsNicknameByOther(@Param("nickname") String nickname,
                                  @Param("userId") Long userId);

    /** 전달된(널이 아닌) 프로필 필드만 동적으로 갱신 */
    int updateProfile(@Param("userId") Long userId,
                      @Param("nickname") String nickname,
                      @Param("profileImageUrl") String profileImageUrl,
                      @Param("introduce") String introduce);

    /** 태그 id 목록 중 실제 존재하는 개수 (FK 오류 전 유효성 검증용) */
    int countExistingTagIds(@Param("tagIds") List<Long> tagIds);

    /** 사용자의 기존 관심사 전체 삭제 (재설정 시 교체 목적) */
    int deleteUserInterests(@Param("userId") Long userId);

    /** 관심사(user_interests) 일괄 저장 */
    int insertUserInterests(@Param("userId") Long userId,
                            @Param("tagIds") List<Long> tagIds);

    /** 사용자의 관심 태그를 tags 마스터와 조인해 조회. 없으면 빈 목록. */
    List<Tag> selectInterestTags(@Param("userId") Long userId);
}

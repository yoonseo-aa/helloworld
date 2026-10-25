package com.helloworld.domain.follow.mapper;

import com.helloworld.domain.follow.domain.FollowRelationRow;
import com.helloworld.domain.follow.domain.FollowUserRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 팔로우 도메인 DB 접근 (MyBatis). SQL은 resources/mapper/follow/FollowMapper.xml.
 * 1단계에서는 users 테이블 읽기만 필요(대상 존재 확인, 목록 프로필 조회).
 * follows 테이블 INSERT/DELETE(비동기 백업)는 2단계(SQS Worker)에서 추가한다.
 */
@Mapper
public interface FollowMapper {

    /** 대상 사용자 존재 여부 */
    boolean existsUser(@Param("userId") Long userId);

    /** id 목록으로 프로필 조회 (순서 보장 안 됨 → 서비스에서 재정렬) */
    List<FollowUserRow> selectUsersByIds(@Param("ids") List<Long> ids);

    /** 팔로우 관계 저장 (SQS Worker가 비동기 호출). 이미 있으면 no-op(멱등) */
    int insertFollow(@Param("followerId") long followerId,
                     @Param("followingId") long followingId,
                     @Param("createdAt") LocalDateTime createdAt);

    /** 팔로우 관계 삭제 (hard delete). 없으면 0행(멱등) */
    int deleteFollow(@Param("followerId") long followerId,
                     @Param("followingId") long followingId);

    /** 캐시 미스 복구용: userId가 팔로우하는 대상(following_id)+시각 목록 (user:following:{userId} 복구) */
    List<FollowRelationRow> selectFollowingRows(@Param("followerId") long followerId);

    /** 캐시 미스 복구용: userId를 팔로우하는 사람(follower_id)+시각 목록 (user:followers:{userId} 복구) */
    List<FollowRelationRow> selectFollowerRows(@Param("followingId") long followingId);
}

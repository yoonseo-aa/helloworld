package com.helloworld.domain.github.mapper;

import com.helloworld.domain.github.entity.GithubAccount;
import com.helloworld.domain.github.entity.GithubStats;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;

/**
 * GitHub 연동 계정 · 통계(잔디 + 기술스택) DB 접근 (MyBatis).
 * SQL은 resources/mapper/github/GithubMapper.xml 에 작성.
 */
@Mapper
public interface GithubMapper {

    /* ===== 연동 계정 ===== */

    Optional<GithubAccount> selectAccountByUserId(@Param("userId") Long userId);

    /** github_id로 조회. 다른 회원이 이미 그 GitHub 계정을 쓰고 있는지 확인할 때 사용. */
    Optional<GithubAccount> selectAccountByGithubId(@Param("githubId") Long githubId);

    /** 배치 대상 전체. 계정마다 자기 토큰으로 조회해야 하므로 계정 전체를 가져온다. */
    List<GithubAccount> selectAllAccounts();

    /**
     * 연동 저장. 재연동이면 토큰·사용자명만 갱신되도록 UPSERT로 처리한다
     * (uk_github_accounts_user 충돌 시 UPDATE).
     */
    int upsertAccount(GithubAccount account);

    int updateLastSyncedAt(@Param("userId") Long userId,
                           @Param("githubLogin") String githubLogin);

    int deleteAccount(@Param("userId") Long userId);

    /**
     * users.github_username 갱신.
     *
     * <p>users 테이블이지만 이 컬럼은 스키마 주석 그대로 "잔디 연동용"이고, 값을 채우고 비우는
     * 시점을 아는 것은 github 도메인뿐이라 여기서 관리한다. (검색·프로필이 이 컬럼을 읽는다.)
     * 연동 해제 시에는 null을 넘겨 비운다.
     */
    int updateUserGithubUsername(@Param("userId") Long userId,
                                 @Param("githubUsername") String githubUsername);

    /* ===== 통계 (사용자당 1행) ===== */

    /**
     * 통계 저장. 사용자당 1행이라 UPSERT 한 문장으로 끝난다.
     *
     * <p>매일 밤 1년치를 통째로 교체하는데, 문서가 하나라서 "삭제 후 삽입" 같은
     * 다단계 조작이 필요 없다. 한 문장이 곧 원자적 교체다.
     */
    int upsertStats(GithubStats stats);

    Optional<GithubStats> selectStats(@Param("userId") Long userId);

    int deleteStats(@Param("userId") Long userId);
}

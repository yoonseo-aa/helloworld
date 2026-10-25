package com.helloworld.domain.github.service;

import com.helloworld.domain.github.entity.GithubAccount;
import com.helloworld.domain.github.mapper.GithubMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 연동 계정 쓰기 트랜잭션 경계.
 *
 * <p>{@link GithubStatsWriter}와 같은 이유로 GithubService에서 분리했다 —
 * 연동 흐름은 "GitHub 왕복 → 저장 → 저장"이라, 저장 구간에만 짧게 트랜잭션이 걸려야
 * 커넥션이 외부 호출 시간만큼 묶이지 않는다. 또 같은 클래스 내부 호출로는
 * {@code @Transactional}이 동작하지 않아 롤백이 조용히 사라진다.
 */
@Service
@RequiredArgsConstructor
public class GithubAccountWriter {

    private final GithubMapper githubMapper;

    /**
     * 연동 계정 저장(UPSERT) + users.github_username 동기화.
     * 두 쓰기가 어긋나면 프로필엔 GitHub 사용자명이 보이는데 잔디는 없는 상태가 되므로 한 트랜잭션이다.
     */
    @Transactional
    public void save(GithubAccount account) {
        try {
            githubMapper.upsertAccount(account);
            githubMapper.updateUserGithubUsername(account.getUserId(), account.getGithubLogin());
        } catch (DuplicateKeyException e) {
            // 사전 검사와 저장 사이에 다른 회원이 같은 GitHub 계정을 연동했을 수 있다(TOCTOU).
            // 유일성의 최종 보장은 DB 제약(uk_github_accounts_github_id / uk_users_github_username)이므로,
            // 500이 아니라 409로 응답한다.
            throw new BusinessException(ErrorCode.GITHUB_ALREADY_CONNECTED);
        }
    }

    /** 연동 해제. 통계 문서도 함께 지운다(연동을 끊었는데 잔디가 남아 있으면 안 된다). */
    @Transactional
    public void delete(Long userId) {
        githubMapper.deleteStats(userId);
        githubMapper.deleteAccount(userId);
        githubMapper.updateUserGithubUsername(userId, null);
    }
}

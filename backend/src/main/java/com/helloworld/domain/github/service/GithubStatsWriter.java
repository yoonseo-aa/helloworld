package com.helloworld.domain.github.service;

import com.helloworld.domain.github.entity.GithubStats;
import com.helloworld.domain.github.mapper.GithubMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 통계(잔디 + 기술스택) 저장 트랜잭션 경계.
 *
 * <p><b>왜 GithubSyncService와 분리했나</b> — 동기화는 "GitHub 호출(최대 20초) → DB 저장"인데,
 * 이걸 한 메서드에 두고 {@code @Transactional}을 붙이면 HTTP 응답을 기다리는 내내
 * 커넥션 풀의 커넥션 하나를 붙잡는다. 연동 요청이 몰리면 GitHub이 느린 것만으로 풀이 말라
 * 잔디와 무관한 API까지 같이 느려진다.
 *
 * <p>게다가 같은 클래스 안에서 {@code this.save(...)}로 부르면 스프링 AOP 프록시를 거치지 않아
 * {@code @Transactional}이 <b>조용히 무시된다</b>. 컴파일도 되고 로그도 안 남아서, 롤백이
 * 안 된다는 사실은 데이터가 반쯤 저장된 뒤에야 드러난다. 경계를 다른 빈으로 빼면 호출이
 * 반드시 프록시를 지나므로 이 함정 자체가 사라진다.
 */
@Service
@RequiredArgsConstructor
public class GithubStatsWriter {

    private final GithubMapper githubMapper;

    /**
     * 통계 문서를 통째로 교체하고 동기화 시각을 갱신한다.
     *
     * <p>사용자당 1행이라 교체가 UPSERT 한 문장이다. 날짜당 1행 구조에서 필요했던
     * "전부 삭제 후 다시 삽입"이 없어서, 삭제만 되고 삽입이 실패해 잔디가 비는 중간 상태가
     * 애초에 생기지 않는다.
     *
     * <p>그래도 트랜잭션으로 묶는 이유는 {@code last_synced_at}과의 정합성이다. 문서는
     * 새로 들어갔는데 동기화 시각 갱신이 실패하면, 화면이 "어제 기준"이라고 거짓말을 하게 된다.
     *
     * @param githubLogin GitHub에서 사용자명이 바뀌었을 수 있어 동기화 때마다 함께 갱신한다.
     */
    @Transactional
    public void replace(GithubStats stats, String githubLogin) {
        githubMapper.upsertStats(stats);
        githubMapper.updateLastSyncedAt(stats.getUserId(), githubLogin);
    }
}

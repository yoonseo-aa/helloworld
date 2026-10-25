package com.helloworld.domain.badge.service;

import com.helloworld.domain.badge.dto.response.BadgeResponse;
import com.helloworld.domain.badge.entity.BadgeCode;
import com.helloworld.domain.badge.entity.BadgeMetrics;
import com.helloworld.domain.badge.mapper.BadgeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 배지 조회. <b>저장하지 않고 조회 시점에 계산한다.</b>
 *
 * <p>덕분에 지급 배치도, 게시글 삭제 · 좋아요 취소 경로마다 붙는 회수 훅도 없다.
 * 데이터가 바뀌면 다음 조회부터 자동으로 반영되므로 저장값과 실제가 어긋날 여지가 없다.
 *
 * <p>비용은 프로필 조회당 집계 쿼리 1회다. 전부 인덱스가 걸린 컬럼(user_id)의 단순 집계라
 * 지금 규모에서는 캐시 없이도 충분하다. 프로필 트래픽이 늘어 부담이 되면
 * 사용자 단위로 Redis에 짧게 캐싱하는 것이 다음 수순이다 — 배지는 몇 초 늦게 반영돼도 무방하다.
 */
@Service
@RequiredArgsConstructor
public class BadgeService {

    private final BadgeMapper badgeMapper;

    /**
     * 프로필에 노출할 배지 목록. 축별 최고 등급 하나씩이라 최대 4개다.
     * 아직 아무것도 달성하지 못했으면 빈 목록을 반환한다.
     */
    @Transactional(readOnly = true)
    public List<BadgeResponse> getBadges(Long userId) {
        BadgeMetrics metrics = resolveMetrics(userId);

        return BadgeCode.highestPerAxis(metrics).stream()
                .map(badge -> BadgeResponse.of(badge, metrics))
                .toList();
    }

    private BadgeMetrics resolveMetrics(Long userId) {
        BadgeMetrics metrics = badgeMapper.selectMetrics(userId);
        return metrics == null ? BadgeMetrics.empty() : metrics;
    }
}

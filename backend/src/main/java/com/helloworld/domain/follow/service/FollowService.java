package com.helloworld.domain.follow.service;

import com.helloworld.domain.follow.domain.FollowRelationRow;
import com.helloworld.domain.follow.domain.FollowUserRow;
import com.helloworld.domain.follow.dto.response.FollowCountResponse;
import com.helloworld.domain.follow.dto.response.FollowListResponse;
import com.helloworld.domain.follow.dto.response.FollowToggleResponse;
import com.helloworld.domain.follow.dto.response.FollowUserResponse;
import com.helloworld.domain.follow.event.FollowEvent;
import com.helloworld.domain.follow.event.FollowEventPublisher;
import com.helloworld.domain.follow.event.FollowEventType;
import com.helloworld.domain.follow.mapper.FollowMapper;
import com.helloworld.domain.follow.repository.FollowRedisRepository;
import com.helloworld.domain.follow.repository.FollowRedisRepository.ScoredMember;
import com.helloworld.domain.follow.repository.FollowRedisRepository.ToggleResult;
import com.helloworld.domain.notification.service.NotificationService;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 팔로우 서비스. 관계·카운트 정본은 Redis(ZSET).
 * 1단계: Redis 토글/조회만. RDB(follows) 반영은 2단계(SQS 이벤트 → Worker)에서 추가.
 */
@Service
@RequiredArgsConstructor
public class FollowService {

    /** 목록 페이지 최대 크기. 과대/음수 size로 인한 전체 조회·DoS를 막기 위해 이 범위로 clamp한다. */
    private static final int MAX_PAGE_SIZE = 100;

    private final FollowRedisRepository followRedis;
    private final FollowMapper followMapper;
    private final FollowEventPublisher followEventPublisher;

    /**
     * 팔로우 알림 생성용. 알림은 부가 기능이라 이 서비스의 메서드는 예외를 던지지 않는다 —
     * 알림 저장이 실패해도 팔로우 자체는 성공으로 끝난다.
     */
    private final NotificationService notificationService;

    /** 팔로우 (followerId = 로그인 사용자, followingId = 대상) */
    public FollowToggleResponse follow(long followerId, long followingId) {
        if (followerId == followingId) {
            throw new BusinessException(ErrorCode.CANNOT_FOLLOW_SELF);
        }
        ensureUserExists(followingId);
        // 키가 유실된 상태에서 토글하면 ZADD가 원소 1개짜리 세트를 새로 만들어 기존 관계가 정본에서 사라진다.
        // 토글 전에 두 키를 DB에서 복구해 정본 손상을 막는다.
        ensureFollowingWarm(followerId);
        ensureFollowersWarm(followingId);
        long occurredAt = System.currentTimeMillis();
        ToggleResult result = followRedis.follow(followerId, followingId, occurredAt);
        // 이제 두 세트는 0건이 아니다 → 오래된 "빈 관계" 표식이 잘못된 0을 반환하지 않도록 제거
        followRedis.clearFollowingEmpty(followerId);
        followRedis.clearFollowersEmpty(followingId);
        // 실제 상태 변화(신규 팔로우)일 때만 RDB 반영 이벤트 발행 (멱등 재요청은 불필요한 발행/DB no-op 방지)
        if (result.changed()) {
            followEventPublisher.publish(new FollowEvent(FollowEventType.FOLLOW, followerId, followingId, occurredAt));
            // 알림도 상태가 실제로 바뀔 때만 만든다. 이미 팔로우 중인데 버튼을 다시 눌러도
            // 알림이 새로 뜨지 않는다. (생성 실패는 알림 쪽에서 삼키므로 팔로우가 깨지지 않는다)
            notificationService.notifyFollow(followingId, followerId);
        }
        return FollowToggleResponse.of(true, result.followerCount());
    }

    /** 언팔로우 (멱등: 이미 아니어도 에러 없이 현재 상태 반환) */
    public FollowToggleResponse unfollow(long followerId, long followingId) {
        ensureUserExists(followingId);
        // 언팔로우도 동일: 복구 없이 ZREM하면 미로드 세트에 대해 잘못된 follower_count(ZCARD)를 반환할 수 있다.
        ensureFollowingWarm(followerId);
        ensureFollowersWarm(followingId);
        long occurredAt = System.currentTimeMillis();
        ToggleResult result = followRedis.unfollow(followerId, followingId);
        // 실제 관계가 있던 경우에만 삭제 이벤트 발행
        if (result.changed()) {
            followEventPublisher.publish(new FollowEvent(FollowEventType.UNFOLLOW, followerId, followingId, occurredAt));
        }
        return FollowToggleResponse.of(false, result.followerCount());
    }

    /**
     * 팔로우 상태 단건 조회 (프로필 페이지 팔로우 버튼용).
     * viewer(로그인 사용자)가 target을 팔로우 중인지 + target의 팔로워 수를 반환한다.
     * 리로드 시에도 버튼 상태(팔로우 하기/팔로우 중)를 정확히 그릴 수 있게 한다.
     */
    @Transactional(readOnly = true)
    public FollowToggleResponse followStatus(long viewerId, long targetId) {
        ensureUserExists(targetId);
        ensureFollowingWarm(viewerId);   // is_following(ZSCORE) 판단용
        ensureFollowersWarm(targetId);   // follower_count(ZCARD)용
        boolean isFollowing = followRedis.isFollowing(viewerId, targetId);
        long followerCount = followRedis.countFollowers(targetId);
        return FollowToggleResponse.of(isFollowing, followerCount);
    }

    /** SQS Worker가 소비한 이벤트를 RDB(follows)에 반영. 관계 정본은 Redis, 여기는 비동기 백업. */
    @Transactional
    public void applyFollowEvent(FollowEvent event) {
        switch (event.getType()) {
            case FOLLOW -> {
                LocalDateTime createdAt = LocalDateTime.ofInstant(
                        Instant.ofEpochMilli(event.getOccurredAt()), ZoneId.systemDefault());
                followMapper.insertFollow(event.getFollowerId(), event.getFollowingId(), createdAt);
            }
            case UNFOLLOW -> followMapper.deleteFollow(event.getFollowerId(), event.getFollowingId());
        }
    }

    /**
     * 메인 피드 조회용: 로그인 유저가 팔로우하는 모든 user_id.
     * 콜드 캐시(Redis 유실 등)면 follows에서 warm 복구한 뒤 읽는다. 정본은 Redis(user:following).
     */
    @Transactional(readOnly = true)
    public List<Long> getFollowingUserIds(long userId) {
        ensureFollowingWarm(userId);
        return followRedis.followingIds(userId);
    }

    /**
     * 게시물 상세 등: viewer가 target을 팔로우 중인지 단건 판단. 콜드 캐시면 warm 후 읽는다.
     * 자기 자신은 팔로우 대상이 아니므로 항상 false.
     */
    @Transactional(readOnly = true)
    public boolean isFollowing(long viewerId, long targetId) {
        if (viewerId == targetId) {
            return false;
        }
        ensureFollowingWarm(viewerId);
        return followRedis.isFollowing(viewerId, targetId);
    }

    @Transactional(readOnly = true)
    public FollowCountResponse followingCount(long userId) {
        ensureUserExists(userId);
        ensureFollowingWarm(userId);
        return FollowCountResponse.following(followRedis.countFollowing(userId));
    }

    @Transactional(readOnly = true)
    public FollowCountResponse followerCount(long userId) {
        ensureUserExists(userId);
        ensureFollowersWarm(userId);
        return FollowCountResponse.follower(followRedis.countFollowers(userId));
    }

    @Transactional(readOnly = true)
    public FollowListResponse followingList(long viewerId, long userId, Long cursor, int size) {
        ensureUserExists(userId);
        ensureFollowingWarm(userId);      // 목록 출처
        ensureFollowingWarm(viewerId);    // 각 항목 is_following 판단용
        int pageSize = normalizePageSize(size);
        return buildList(viewerId, followRedis.listFollowing(userId, cursor, pageSize + 1), pageSize);
    }

    @Transactional(readOnly = true)
    public FollowListResponse followerList(long viewerId, long userId, Long cursor, int size) {
        ensureUserExists(userId);
        ensureFollowersWarm(userId);      // 목록 출처
        ensureFollowingWarm(viewerId);    // 각 항목 is_following 판단용
        int pageSize = normalizePageSize(size);
        return buildList(viewerId, followRedis.listFollowers(userId, cursor, pageSize + 1), pageSize);
    }

    /** size를 [1, MAX_PAGE_SIZE]로 clamp. 음수/0 → 1, 과대값 → 상한. (pageSize+1 오버플로도 방지) */
    private int normalizePageSize(int size) {
        if (size < 1) {
            return 1;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }

    /**
     * ZSET에서 뽑은 (id, score) 목록에 users 프로필 + 뷰어 기준 팔로우 여부를 붙여 응답을 만든다.
     * has_next 판단을 위해 size+1개를 받아 마지막 1개는 잘라낸다.
     */
    private FollowListResponse buildList(long viewerId, List<ScoredMember> raw, int size) {
        boolean hasNext = raw.size() > size;
        List<ScoredMember> page = hasNext ? raw.subList(0, size) : raw;
        if (page.isEmpty()) {
            return FollowListResponse.of(List.of(), null, false);
        }

        List<Long> ids = page.stream().map(ScoredMember::id).toList();
        Map<Long, FollowUserRow> profiles = followMapper.selectUsersByIds(ids).stream()
                .collect(Collectors.toMap(FollowUserRow::getUserId, row -> row));
        List<Boolean> flags = followRedis.isFollowing(viewerId, ids);

        List<FollowUserResponse> content = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) {
            FollowUserRow row = profiles.get(ids.get(i));
            if (row == null) {
                continue; // 프로필이 없는(탈퇴 등) 사용자는 목록에서 제외
            }
            boolean isFollowing = i < flags.size() && Boolean.TRUE.equals(flags.get(i));
            content.add(FollowUserResponse.of(
                    row.getUserId(), row.getNickname(), row.getProfileImageUrl(),
                    row.getIntroduce(), isFollowing));
        }

        Long nextCursor = hasNext ? page.get(page.size() - 1).score() : null;
        return FollowListResponse.of(content, nextCursor, hasNext);
    }

    private void ensureUserExists(long userId) {
        if (!followMapper.existsUser(userId)) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
    }

    /**
     * user:following:{userId} 키가 없으면(=캐시 미스) DB follows에서 읽어 ZSET을 복구한다.
     * 키가 있으면(진짜 0명 포함) 아무것도 하지 않는다. 관계가 0건이면 키를 만들 수 없어 매 호출 시
     * 가벼운 재조회가 발생하지만(설계서 3장 허용), 관계가 있으면 첫 미스에서 복구 후 이후 히트한다.
     */
    private void ensureFollowingWarm(long userId) {
        if (followRedis.existsFollowing(userId)) {
            return; // 정본 ZSET 있음
        }
        if (followRedis.isFollowingEmptyMarked(userId)) {
            return; // 최근 "0건" 확인됨 → TTL 동안 DB 재조회 skip
        }
        List<ScoredMember> members = toScored(followMapper.selectFollowingRows(userId));
        if (members.isEmpty()) {
            followRedis.markFollowingEmpty(userId); // 0건 표식(TTL) → 다음 요청부터 DB 안 감
        } else {
            followRedis.warmFollowing(userId, members);
        }
    }

    /** user:followers:{userId} 키가 없으면 DB에서 읽어 ZSET을 복구한다. (ensureFollowingWarm의 팔로워 버전) */
    private void ensureFollowersWarm(long userId) {
        if (followRedis.existsFollowers(userId)) {
            return;
        }
        if (followRedis.isFollowersEmptyMarked(userId)) {
            return;
        }
        List<ScoredMember> members = toScored(followMapper.selectFollowerRows(userId));
        if (members.isEmpty()) {
            followRedis.markFollowersEmpty(userId);
        } else {
            followRedis.warmFollowers(userId, members);
        }
    }

    /**
     * DB 행(FollowRelationRow)을 ZSET 원소(ScoredMember)로 변환.
     * score(epoch ms)는 팔로우 시각을 저장할 때와 동일한 방식(systemDefault)으로 환산해 정확히 round-trip시킨다.
     * (follows.created_at은 DATETIME(초 단위)이라 밀리초는 절삭 — 커서 동점 후속 과제 참고)
     */
    private List<ScoredMember> toScored(List<FollowRelationRow> rows) {
        return rows.stream()
                .map(r -> new ScoredMember(
                        r.getUserId(),
                        r.getCreatedAt().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()))
                .toList();
    }
}

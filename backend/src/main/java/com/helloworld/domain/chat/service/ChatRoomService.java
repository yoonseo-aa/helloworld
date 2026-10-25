package com.helloworld.domain.chat.service;

import com.helloworld.domain.chat.dto.request.ChatRoomCreateRequest;
import com.helloworld.domain.chat.dto.response.ChatRoomCreateResponse;
import com.helloworld.domain.chat.dto.response.ChatRoomListResponse;
import com.helloworld.domain.chat.dto.response.ChatRoomSummaryResponse;
import com.helloworld.domain.chat.dto.response.UnreadCountResponse;
import com.helloworld.domain.chat.entity.ChatRoomCounterpart;
import com.helloworld.domain.chat.entity.ChatRoomSummary;
import com.helloworld.domain.chat.entity.DmRoom;
import com.helloworld.domain.chat.mapper.ChatRoomMapper;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 채팅방 생성/재사용 비즈니스 로직. 트랜잭션 경계는 이 계층에만 둔다.
 *
 * 핵심: 같은 상대와 여러 번 '새 대화'를 눌러도 방이 늘어나지 않는다(사실상 멱등).
 * DIRECT 방은 pair_key(UNIQUE)로 중복을 막고, 동시 요청 경쟁까지 처리한다.
 */
@Service
@RequiredArgsConstructor
public class ChatRoomService {

    private static final String ROOM_TYPE_DIRECT = "DIRECT";
    private static final String ROOM_TYPE_GROUP = "GROUP";

    private static final int DEFAULT_ROOM_PAGE_SIZE = 20;
    private static final int MAX_ROOM_PAGE_SIZE = 50;

    private final ChatRoomMapper chatRoomMapper;

    /**
     * 참여자 조합으로 방을 찾거나 만든다.
     * DIRECT(상대 1명): 기존 방이 있으면 재사용, 없으면 생성
     * GROUP(상대 2명 이상): 항상 새로 생성 (인원 조합으로 방을 묶지 않음)
     */
    @Transactional
    public ChatRoomCreateResponse createOrGetRoom(Long myUserId, ChatRoomCreateRequest request) {
        List<Long> targetIds = normalizeTargets(myUserId, request.getTargetUserIds());

        // 대상 사용자가 실제로 있는지 먼저 확인 (FK 오류로 500 나는 것을 막는다)
        if (chatRoomMapper.countExistingUserIds(targetIds) != targetIds.size()) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }

        boolean isDirect = targetIds.size() == 1;
        return isDirect
                ? createOrGetDirectRoom(myUserId, targetIds.get(0))
                : createGroupRoom(myUserId, targetIds);
    }

    /**
     * 대화 목록 조회. 최신 대화가 먼저 온다.
     *
     * N+1을 피하기 위해 쿼리를 <b>두 번만</b> 쓴다.
     * 1) 방 + 마지막 메시지 + 안읽음 수 (한 방에)
     * 2) 그 방들의 상대방 정보 (room_id들을 IN으로 묶어 한 번에)
     *
     * 방마다 따로 조회하면 방 20개에 41번(1 + 20 + 20)이 나간다.
     * 목록은 접속마다 호출되는 화면이라 여기서 N+1이 나면 가장 아프다.
     */
    @Transactional(readOnly = true)
    public ChatRoomListResponse getRooms(Long userId, String keyword, Long beforeLastMessageId,
                                        Long beforeRoomId, Integer size) {
        int limit = normalizeSize(size);

        // has_next 판정을 위해 한 건 더 읽는다. COUNT 쿼리를 따로 날리는 것보다 싸다.
        List<ChatRoomSummary> found = chatRoomMapper.selectRoomSummaries(
                userId, normalizeKeyword(keyword), beforeLastMessageId, beforeRoomId, limit + 1);

        boolean hasNext = found.size() > limit;
        List<ChatRoomSummary> page = hasNext ? found.subList(0, limit) : found;

        if (page.isEmpty()) {
            return ChatRoomListResponse.of(List.of(), false);
        }

        List<Long> roomIds = page.stream().map(ChatRoomSummary::getRoomId).toList();
        Map<Long, List<ChatRoomCounterpart>> byRoom = chatRoomMapper
                .selectCounterparts(roomIds, userId).stream()
                .collect(Collectors.groupingBy(ChatRoomCounterpart::getRoomId));

        List<ChatRoomSummaryResponse> rooms = page.stream()
                .map(s -> ChatRoomSummaryResponse.of(
                        s,
                        byRoom.getOrDefault(s.getRoomId(), List.of()),
                        ChatMessageService.DELETED_PLACEHOLDER))
                .toList();

        return ChatRoomListResponse.of(rooms, hasNext);
    }

    /** 전체 안읽음 합계 (헤더·탭 뱃지용) */
    @Transactional(readOnly = true)
    public UnreadCountResponse getTotalUnreadCount(Long userId) {
        return UnreadCountResponse.of(chatRoomMapper.selectTotalUnreadCount(userId));
    }

    private int normalizeSize(Integer size) {
        if (size == null || size <= 0) {
            return DEFAULT_ROOM_PAGE_SIZE;
        }
        return Math.min(size, MAX_ROOM_PAGE_SIZE);
    }

    /**
     * 검색어 정리. 공백뿐이면 검색하지 않는 것으로 본다(null 반환 → 조건 제거).
     *
     * LIKE 와일드카드 이스케이프가 핵심이다. 사용자가 {@code %} 한 글자를 입력하면
     * "모든 방"이 검색되고, {@code _}는 아무 한 글자와 일치한다.
     * 이스케이프 문자로 쓰는 {@code !} 자체도 먼저 처리해야 순서가 어긋나지 않는다.
     *
     * SQL 주입은 별개 문제이며 MyBatis의 {@code #{}} 바인딩으로 이미 막혀 있다.
     * 여기서 막는 것은 "검색 결과가 의도와 달라지는 것"이다.
     */
    private String normalizeKeyword(String keyword) {
        if (!StringUtils.hasText(keyword)) {
            return null;
        }
        return keyword.trim()
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
    }

    /**
     * 방의 참여자인지 확인하고, 아니면 예외를 던진다.
     *
     * WebSocket에서 방 topic을 구독하거나 메시지를 발행할 때 쓴다.
     * 이 검사가 없으면 로그인한 사용자가 아무 room_id나 넣어 남의 대화를 엿보거나 끼어들 수 있다.
     * (구독 주소는 클라이언트가 정하는 값이라 신뢰할 수 없다)
     */
    @Transactional(readOnly = true)
    public void validateParticipant(Long roomId, Long userId) {
        if (!chatRoomMapper.existsMember(roomId, userId)) {
            throw new BusinessException(ErrorCode.CHAT_NOT_PARTICIPANT);
        }
    }

    /** 상대 id 목록 정리: null·중복 제거 + 자기 자신 포함 여부 검증 */
    private List<Long> normalizeTargets(Long myUserId, List<Long> rawTargetIds) {
        List<Long> targetIds = rawTargetIds.stream()
                .filter(id -> id != null)
                .distinct()
                .toList();

        if (targetIds.isEmpty()) {
            throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM, "대화 상대를 한 명 이상 지정해야 합니다.");
        }
        if (targetIds.contains(myUserId)) {
            throw new BusinessException(ErrorCode.CHAT_CANNOT_INVITE_SELF);
        }
        return targetIds;
    }

    /**
     * 1:1 방을 찾거나 만든다.
     *
     * pair_key로 먼저 조회하고 없으면 INSERT 하는데, 그 사이에 상대가 같은 방을 만들 수 있다.
     * (조회 시점과 생성 시점이 다른 TOCTOU 상황)
     * 최종 방어선은 pair_key UNIQUE 제약이므로, 충돌하면 상대가 만든 방을 다시 조회해 돌려준다.
     * → 어느 쪽이 먼저 눌러도 결과가 같다(멱등).
     */
    private ChatRoomCreateResponse createOrGetDirectRoom(Long myUserId, Long targetId) {
        String pairKey = buildPairKey(myUserId, targetId);

        Long existingRoomId = chatRoomMapper.selectRoomIdByPairKey(pairKey);
        if (existingRoomId != null) {
            return ChatRoomCreateResponse.of(existingRoomId, ROOM_TYPE_DIRECT, false);
        }

        try {
            Long roomId = insertRoomWithMembers(
                    ROOM_TYPE_DIRECT, null, pairKey, myUserId, List.of(targetId));
            return ChatRoomCreateResponse.of(roomId, ROOM_TYPE_DIRECT, true);
        } catch (DuplicateKeyException e) {
            // 동시에 상대도 방을 만든 경우 — 이미 생긴 방을 재사용한다.
            //
            // 여기서 일반 SELECT(selectRoomIdByPairKey)를 쓰면 안 된다.
            // MySQL 기본 격리수준 REPEATABLE READ에서는 위쪽 조회가 만든 스냅샷을 계속 보기 때문에
            // 상대가 방금 커밋한 방이 null로 나오고, 결국 예외를 다시 던져 500이 된다.
            // FOR SHARE 잠금 읽기는 최신 커밋 데이터를 읽는다.
            Long raced = chatRoomMapper.selectRoomIdByPairKeyForShare(pairKey);
            if (raced == null) {
                throw e;   // pair_key 외의 다른 중복이거나 상대가 롤백한 경우 — 감추지 않고 올린다
            }
            return ChatRoomCreateResponse.of(raced, ROOM_TYPE_DIRECT, false);
        }
    }

    /** 그룹 방 생성. pair_key는 쓰지 않으므로 항상 새 방이 된다. */
    private ChatRoomCreateResponse createGroupRoom(Long myUserId, List<Long> targetIds) {
        Long roomId = insertRoomWithMembers(ROOM_TYPE_GROUP, null, null, myUserId, targetIds);
        return ChatRoomCreateResponse.of(roomId, ROOM_TYPE_GROUP, true);
    }

    /** 방 1행 + 참여자 N행을 함께 저장한다. 하나라도 실패하면 전부 롤백된다. */
    private Long insertRoomWithMembers(String roomType, String title, String pairKey,
                                       Long ownerId, List<Long> targetIds) {
        DmRoom room = DmRoom.builder()
                .roomType(roomType)
                .title(title)
                .createdBy(ownerId)
                .pairKey(pairKey)
                .build();
        chatRoomMapper.insertRoom(room);   // 생성된 room_id가 room에 채워진다

        List<Long> allMembers = new ArrayList<>();
        allMembers.add(ownerId);
        allMembers.addAll(targetIds);
        chatRoomMapper.insertMembers(room.getRoomId(), ownerId, allMembers);

        return room.getRoomId();
    }

    /**
     * DIRECT 방의 pair_key 생성. 두 id를 정렬해 "작은ID_큰ID"로 만든다.
     * A→B와 B→A가 같은 키가 되어야 중복방을 막을 수 있다.
     */
    private String buildPairKey(Long userA, Long userB) {
        long min = Math.min(userA, userB);
        long max = Math.max(userA, userB);
        return min + "_" + max;
    }
}

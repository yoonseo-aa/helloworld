package com.helloworld.domain.post.service;

import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 메인 피드(팔로우 상단 고정) 커서. 정렬 키 (is_pinned, created_at, post_id)와
 * 고정 판정 입력(asOf 기준시각, followingIds 팔로잉 스냅샷)을 담는다.
 *
 * <p>클라이언트에는 <b>불투명 base64 토큰</b>으로 내려간다 — 프론트는 내용을 해석하지 않고
 * 받은 문자열을 다음 요청에 그대로 되돌려주기만 하면 된다. 그래서 커서에 값을 더 넣거나
 * 정렬을 바꿔도 프론트 계약(문자열)은 그대로다. (토큰은 팔로잉 수만큼 커진다.)
 *
 * <p><b>asOf·followingIds를 커서에 싣는 이유(중복/누락 방지)</b>: 고정 판정은
 * {@code (user_id IN followingIds) AND (created_at >= asOf - INTERVAL 30 MINUTE)}이다.
 * 이 판정 입력이 페이지 사이에 바뀌면 이미 본 글의 고정 여부가 뒤집혀, 커서 경계에서
 * <b>중복(다시 보임)이나 누락(사라짐)</b>이 생긴다. 두 입력을 첫 페이지에서 고정해 커서에 싣고
 * 이후 페이지가 재사용하면(asOf=DB NOW() 스냅샷, followingIds=첫 페이지 팔로잉 스냅샷),
 * 한 스크롤 세션 동안 고정 판정이 일관돼 중복·누락이 사라진다.
 * (스크롤 중 팔로우 변경은 다음 새 조회부터 반영된다.)
 *
 * <p>내부 표현은 {@code "{0|1}|{createdAt}|{postId}|{asOf}|{f1,f2,...}"}를 base64url로 인코딩한 값이다.
 */
record FeedCursor(boolean pinned, LocalDateTime createdAt, long postId,
                  LocalDateTime asOf, List<Long> followingIds) {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final String DELIM = "|";
    private static final String LIST_DELIM = ",";

    /** 커서를 불투명 base64url 토큰으로 인코딩한다. */
    static String encode(FeedCursor cursor) {
        String following = (cursor.followingIds == null) ? "" : cursor.followingIds.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(LIST_DELIM));
        String raw = (cursor.pinned ? "1" : "0") + DELIM
                + cursor.createdAt.format(FMT) + DELIM
                + cursor.postId + DELIM
                + cursor.asOf.format(FMT) + DELIM
                + following;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 토큰을 커서로 디코딩한다. 널·빈값이면 null(첫 페이지), 형식이 깨졌으면 COMMON_INVALID_PARAM(400).
     */
    static FeedCursor decodeOrNull(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            // limit=5: 마지막 조각(팔로잉 CSV)에 콤마가 있어도 나뉘지 않게 하고, 0명이면 빈 문자열로 남긴다.
            String[] parts = raw.split("\\" + DELIM, 5);
            boolean pinned = "1".equals(parts[0]);
            LocalDateTime createdAt = LocalDateTime.parse(parts[1], FMT);
            long postId = Long.parseLong(parts[2]);
            LocalDateTime asOf = LocalDateTime.parse(parts[3], FMT);
            List<Long> followingIds = parseFollowing(parts[4]);
            return new FeedCursor(pinned, createdAt, postId, asOf, followingIds);
        } catch (RuntimeException e) {
            // base64 깨짐·파싱 실패·인덱스 초과 등 → 잘못된 커서
            throw new BusinessException(ErrorCode.COMMON_INVALID_PARAM);
        }
    }

    /** 팔로잉 CSV를 파싱한다. 빈 문자열(팔로잉 0명)이면 빈 리스트. */
    private static List<Long> parseFollowing(String csv) {
        List<Long> ids = new ArrayList<>();
        if (csv == null || csv.isEmpty()) {
            return ids;
        }
        for (String s : csv.split(LIST_DELIM)) {
            ids.add(Long.parseLong(s));
        }
        return ids;
    }
}

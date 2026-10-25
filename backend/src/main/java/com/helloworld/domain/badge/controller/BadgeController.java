package com.helloworld.domain.badge.controller;

import com.helloworld.domain.badge.dto.response.BadgeResponse;
import com.helloworld.domain.badge.service.BadgeService;
import com.helloworld.global.common.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 프로필 업적 배지 조회 API. 4축(게시 · 받은 좋아요 · 댓글 · GitHub) × 3티어 = 12종.
 *
 * <p>URL은 users 리소스 하위지만 데이터 소유권이 badge라 컨트롤러는 badge 도메인에 둔다
 * ({@code UserPostController}와 같은 배치 규칙).
 *
 * <p><b>프로필 응답에 끼워 넣지 않고 따로 뺀 이유</b> — 배지는 프로필 진입 직후 바로 필요하지 않고
 * (스크롤해야 보이는 영역), 지표 집계 쿼리가 딸려 있어 프로필 응답을 그만큼 늦춘다.
 * 분리해두면 프론트가 배지만 따로 다시 불러올 수도 있다.
 *
 * <p>이 API가 대체하는 것: 프론트가 {@code achievements.ts}에서 배지를 직접 계산하느라
 * 게시글마다 상세 API를 추가로 호출해 좋아요를 합산하고(N+1), 게시글 수는 골드 기준까지만 세고
 * 멈춰 하한값만 알던 문제. 여기서는 집계 쿼리 한 번으로 정확한 값이 나온다.
 */
@RestController
@RequestMapping("/api/users/{user_id}/badges")
@RequiredArgsConstructor
public class BadgeController {

    private final BadgeService badgeService;

    /**
     * 달성한 배지 조회 — 축별 최고 등급 하나씩, 최대 4개.
     *
     * <p>활동이 없으면 빈 배열이다(오류가 아니다).
     *
     * <p>미달성분까지 회색으로 보여주는 "도감" 화면이 생기면 그때 파라미터를 추가한다.
     * 지금은 그런 화면이 없어 달성분만 내려준다.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<BadgeResponse>>> getBadges(
            @PathVariable("user_id") Long userId) {

        return ResponseEntity.ok(ApiResponse.success(badgeService.getBadges(userId)));
    }
}

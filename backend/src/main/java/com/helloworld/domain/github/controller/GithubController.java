package com.helloworld.domain.github.controller;

import com.helloworld.domain.github.dto.request.GithubConnectRequest;
import com.helloworld.domain.github.dto.response.GithubAuthorizeResponse;
import com.helloworld.domain.github.dto.response.GithubConnectResponse;
import com.helloworld.domain.github.dto.response.GithubContributionResponse;
import com.helloworld.domain.github.service.GithubOAuthFlowService;
import com.helloworld.domain.github.service.GithubService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * GitHub 연동 · 잔디 API. HTTP 요청/응답만 담당한다.
 *
 * <p><b>연동 흐름(백엔드 콜백 방식)</b>
 * <pre>
 *  [프로필] 연동 클릭
 *    → GET /api/github/authorize  (JWT)      인가 URL 받기
 *    → 프론트가 그 URL로 브라우저 이동        GitHub 승인 화면
 *    → GET /api/github/callback   (JWT 없음)  연동 처리 후 프로필로 302
 * </pre>
 *
 * <p><b>URL에 대하여</b> — 규약(CLAUDE.md 4)은 "URL에 동사 금지"지만,
 * {@code /connect}는 확정된 API 명세서를 따른 것이고 {@code /authorize}·{@code /callback}은
 * OAuth 관례상 굳어진 이름이다. 규약을 그대로 적용하기 어려운 자리라 예외로 둔다.
 */
@RestController
@RequiredArgsConstructor
public class GithubController {

    private final GithubService githubService;
    private final GithubOAuthFlowService oAuthFlowService;

    /**
     * GitHub 인가 URL 발급.
     *
     * <p>302가 아니라 JSON으로 돌려준다 — 브라우저의 top-level 이동에는 Authorization 헤더를
     * 실을 수 없어서, "누가 연동을 시작하는지" 알려면 프론트가 fetch로 호출해야 한다.
     * 프론트는 받은 URL로 {@code window.location.href} 이동만 하면 된다.
     */
    @GetMapping("/api/github/authorize")
    public ResponseEntity<ApiResponse<GithubAuthorizeResponse>> authorize(@LoginUserId Long userId) {
        GithubAuthorizeResponse data = GithubAuthorizeResponse.builder()
                .authorizeUrl(oAuthFlowService.buildAuthorizeUrl(userId))
                .build();
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /**
     * GitHub 승인 후 되돌아오는 지점. <b>브라우저가 직접 이동해 오는 주소</b>이며 JWT가 없다.
     * 사용자 식별은 state(Redis)로 한다.
     *
     * <p>응답이 JSON이 아니라 302다. 성공·실패 모두 프론트로 돌려보내고, 결과는
     * 쿼리 파라미터로 알린다({@code ?github=connected} 또는 {@code ?github=failed&reason=...}).
     * 여기서 예외를 던지면 사용자가 화면에서 날것의 에러 JSON을 보게 된다.
     */
    @GetMapping("/api/github/callback")
    public ResponseEntity<Void> callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error) {

        URI location = oAuthFlowService.handleCallback(code, state, error);
        return ResponseEntity.status(HttpStatus.FOUND).location(location).build();
    }

    /**
     * GitHub 계정 연동 (인가 코드를 직접 넘기는 경로).
     *
     * <p>위 authorize/callback 흐름을 쓰면 프론트가 이 API를 부를 일은 없다.
     * 다만 명세에 확정된 엔드포인트이고, 인가 코드를 손으로 얻어 테스트할 때 쓸모가 있어 남겨 둔다.
     * Body 없이 호출하면 이미 저장된 토큰으로 재동기화만 한다.
     */
    @PostMapping("/api/github/connect")
    public ResponseEntity<ApiResponse<GithubConnectResponse>> connect(
            @LoginUserId Long userId,
            @RequestBody(required = false) GithubConnectRequest request) {

        String code = (request == null) ? null : request.getCode();
        GithubConnectResponse data = githubService.connect(userId, code);
        return ResponseEntity.ok(ApiResponse.success("GitHub 계정이 연동되었습니다.", data));
    }

    /** GitHub 연동 해제. 저장된 토큰과 잔디 데이터를 모두 삭제한다. */
    @DeleteMapping("/api/github/connect")
    public ResponseEntity<ApiResponse<Void>> disconnect(@LoginUserId Long userId) {
        githubService.disconnect(userId);
        return ResponseEntity.ok(ApiResponse.success("GitHub 연동이 해제되었습니다."));
    }

    /**
     * 특정 사용자의 잔디 조회 (최근 1년, 일별). DB만 읽으며 GitHub을 호출하지 않는다.
     *
     * <p>명세의 {@code GET /api/github} 는 JWT로 "나"만 조회하는 형태라 남의 프로필에서 쓸 수 없다.
     * 프로필 화면은 타인의 잔디도 상시 노출해야 하므로 경로에 user_id를 두었다.
     *
     * <p>미연동 사용자는 404 {@code GITHUB_NOT_CONNECTED} 로 응답한다. 프론트는 이를
     * 오류가 아니라 "연동 안 함"으로 해석해 잔디 영역을 숨긴다.
     */
    @GetMapping("/api/users/{userId}/github")
    public ResponseEntity<ApiResponse<GithubContributionResponse>> getContributions(
            @PathVariable Long userId) {
        GithubContributionResponse data = githubService.getContributions(userId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}

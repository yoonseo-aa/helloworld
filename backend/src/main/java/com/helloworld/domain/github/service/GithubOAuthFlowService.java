package com.helloworld.domain.github.service;

import com.helloworld.domain.github.client.GithubOAuthProperties;
import com.helloworld.domain.github.support.GithubOAuthStateStore;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Optional;

/**
 * GitHub OAuth 리다이렉트 흐름 조율.
 *
 * <p>흐름은 이렇다.
 * <pre>
 *  [프로필] 연동 클릭
 *    → GET /api/github/authorize   (JWT 있음) — state 발급 후 인가 URL 반환
 *    → 프론트가 그 URL로 이동 → GitHub 승인 화면
 *    → GET /api/github/callback    (JWT 없음) — state로 사용자 복원 → 연동 → 프로필로 302
 * </pre>
 *
 * <p>콜백에는 JWT가 실리지 않는다(브라우저 top-level 이동). 그래서 사용자 식별을
 * {@link GithubOAuthStateStore}가 담당한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GithubOAuthFlowService {

    private final GithubOAuthProperties props;
    private final GithubOAuthStateStore stateStore;
    private final GithubService githubService;

    /** 인가 URL을 조립한다. state는 여기서 발급되어 Redis에 저장된다. */
    public String buildAuthorizeUrl(Long userId) {
        if (!StringUtils.hasText(props.getClientId())) {
            // 설정 누락을 "GitHub 장애"로 오해하지 않도록 기동 후 첫 호출에서 분명히 알린다.
            throw new BusinessException(ErrorCode.GITHUB_SERVER_ERROR,
                    "GitHub OAuth 설정(client-id)이 비어 있습니다. 환경변수를 확인하세요.");
        }

        return UriComponentsBuilder.fromUriString(props.getAuthorizeUri())
                .queryParam("client_id", props.getClientId())
                .queryParam("redirect_uri", props.getRedirectUri())
                .queryParam("scope", props.getScope())
                .queryParam("state", stateStore.issue(userId))
                .build()
                .encode()
                .toUriString();
    }

    /**
     * GitHub 콜백을 처리하고, 사용자를 되돌려 보낼 주소를 만든다.
     *
     * <p><b>여기서는 예외를 던지지 않는다.</b> 이 요청의 응답은 JSON이 아니라 브라우저 리다이렉트다.
     * 예외를 던지면 사용자는 화면에 날것의 에러 JSON을 보게 된다. 실패도 프론트로 돌려보내고,
     * 무엇이 잘못됐는지는 쿼리 파라미터로 알린다.
     *
     * @param code  GitHub이 준 인가 코드 (사용자가 거부하면 없다)
     * @param state /authorize 에서 발급한 값
     * @param error 사용자가 승인을 거부했을 때 GitHub이 채워 보내는 값
     */
    public URI handleCallback(String code, String state, String error) {
        // 콜백이 백엔드까지 도달했는지부터 로그로 확정한다. 실패 원인을 좁힐 때
        // "여기까지 왔는가"가 첫 갈림길인데, 이 줄이 없으면 그걸 확인할 방법이 없다.
        // 값 자체는 자격증명이라 남기지 않고 존재 여부만 남긴다.
        log.info("GitHub 콜백 수신 - code={}, state={}, error={}",
                StringUtils.hasText(code) ? "있음" : "없음",
                StringUtils.hasText(state) ? "있음" : "없음",
                StringUtils.hasText(error) ? error : "없음");

        // 1) state로 사용자 복원. 일회용이라 여기서 소비된다.
        //
        // Redis 장애 시 여기서 예외가 나가면 사용자는 리다이렉트 대신 날것의 에러 JSON을 본다.
        // 이 엔드포인트의 응답은 무슨 일이 있어도 302여야 하므로 감싼다.
        Optional<Long> userId;
        try {
            userId = stateStore.consume(state);
        } catch (Exception e) {
            log.error("GitHub 콜백 - state 조회 실패(Redis 확인 필요)", e);
            return redirect(null, "INVALID_STATE");
        }

        if (userId.isEmpty()) {
            // 두 경우를 구분해서 남긴다. 원인도 고칠 곳도 완전히 다르기 때문이다.
            //  - state 파라미터 자체가 없음 → 프론트가 /api/github/authorize 를 거치지 않고
            //    인가 URL을 직접 조립했을 때 나타난다(프론트 수정 필요).
            //  - 있는데 못 찾음 → TTL 5분 초과(승인에 오래 걸림), 재사용, 또는 우리가
            //    발급하지 않은 값(CSRF 시도).
            if (!StringUtils.hasText(state)) {
                log.warn("GitHub 콜백 - state 파라미터가 없습니다. "
                        + "프론트가 /api/github/authorize 를 거치지 않고 인가 URL을 직접 만들었을 수 있습니다.");
            } else {
                log.warn("GitHub 콜백 - state를 찾을 수 없습니다. "
                        + "만료(5분)·재사용이거나, 이 서버가 발급한 값이 아닙니다.");
            }
            return redirect(null, "INVALID_STATE");
        }
        Long id = userId.get();

        // 2) 사용자가 승인 화면에서 거부한 경우
        if (StringUtils.hasText(error)) {
            log.info("GitHub 콜백 - 사용자가 승인을 거부했습니다. userId={}, error={}", id, error);
            return redirect(id, "ACCESS_DENIED");
        }

        if (!StringUtils.hasText(code)) {
            log.warn("GitHub 콜백 - 인가 코드가 없습니다. userId={}", id);
            return redirect(id, "NO_CODE");
        }

        // 3) 실제 연동 (토큰 교환 → viewer 조회 → 저장)
        try {
            githubService.connect(id, code);
            return redirect(id, null);
        } catch (BusinessException e) {
            // 코드만 남기면 "GITHUB_SERVER_ERROR"가 토큰 교환 실패인지 GraphQL 실패인지 알 수 없다.
            // 메시지와 스택까지 남겨야 다음 실패가 한 번에 읽힌다.
            log.warn("GitHub 연동 실패 - userId={}, code={}, message={}",
                    id, e.getErrorCode().getCode(), e.getMessage(), e);
            return redirect(id, e.getErrorCode().getCode());
        } catch (Exception e) {
            log.error("GitHub 연동 중 예상치 못한 오류 - userId={}", id, e);
            return redirect(id, ErrorCode.COMMON_SERVER_ERROR.getCode());
        }
    }

    /**
     * 프론트로 돌아갈 주소.
     *
     * <p>성공하면 본인 프로필({@code /users/{userId}})로 보낸다 — 방금 연결한 잔디를 바로 보여주기 위해서다.
     * 사용자가 누구인지조차 모르는 경우(state 무효)에는 프로필 경로를 만들 수 없으므로 홈으로 보낸다.
     */
    private URI redirect(Long userId, String errorCode) {
        String path = (userId == null) ? "/" : "/users/" + userId;

        UriComponentsBuilder builder = UriComponentsBuilder
                .fromUriString(props.getFrontBaseUrl())
                .path(path);

        if (errorCode == null) {
            builder.queryParam("github", "connected");
        } else {
            builder.queryParam("github", "failed").queryParam("reason", errorCode);
        }
        return builder.build().encode().toUri();
    }
}

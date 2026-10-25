package com.helloworld.domain.github.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;

/**
 * GitHub OAuth 토큰 교환 클라이언트. 인가 코드를 access token으로 바꾸는 일만 한다.
 *
 * <p>사용자 정보 조회(REST {@code /user})는 여기 없다 — {@link GithubGraphQlClient}의
 * {@code viewer}가 databaseId·login을 잔디와 함께 한 번에 주기 때문에,
 * 왕복을 하나 줄였다.
 *
 * <p><b>GitHub의 특이점</b> — 토큰 교환이 실패해도 HTTP 200을 준다.
 * 만료·재사용된 코드면 {@code {"error":"bad_verification_code"}} 가 200으로 돌아오므로,
 * 상태 코드가 아니라 본문에 access_token이 있는지로 성공을 판단해야 한다.
 * 4xx만 보고 있으면 "연동 성공"으로 잘못 처리된다.
 *
 * <p><b>응답을 JsonNode로 받는 이유</b> — 이 프로젝트는
 * {@code spring.jackson.property-naming-strategy: SNAKE_CASE} 가 전역이라 DTO 필드
 * {@code accessToken}은 역직렬화 때도 {@code access_token}을 찾는다. GitHub 응답은
 * 여기서는 우연히 맞지만 GraphQL 쪽은 전부 camelCase라 규칙이 갈린다.
 * 필드마다 {@code @JsonProperty}를 붙이는 방식은 필드가 늘수록 실수하기 쉬워,
 * 외부 JSON은 있는 그대로 읽는 JsonNode로 통일했다. 내부 DTO는 규약대로 snake_case를 유지한다.
 */
@Component
public class GithubOAuthClient {

    private final GithubOAuthProperties props;
    private final RestClient restClient;

    public GithubOAuthClient(GithubOAuthProperties props, RestClient.Builder restClientBuilder) {
        this.props = props;
        // GitHub 응답 지연 시 워커 스레드가 무한정 묶이지 않도록 타임아웃 지정
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.restClient = restClientBuilder.requestFactory(factory).build();
    }

    /** 인가 코드 → access token 교환. 코드는 1회용이라 재시도하려면 인가 화면부터 다시 거쳐야 한다. */
    public String exchangeCodeForToken(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", props.getClientId());
        form.add("client_secret", props.getClientSecret());

        try {
            JsonNode body = restClient.post()
                    .uri(props.getTokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    // 이 헤더가 없으면 GitHub은 JSON이 아니라 x-www-form-urlencoded 문자열을 준다.
                    .accept(MediaType.APPLICATION_JSON)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            // 실패도 200으로 오므로 본문으로 판단한다(위 클래스 주석 참고).
            if (body == null || !body.hasNonNull("access_token")) {
                throw new BusinessException(ErrorCode.GITHUB_INVALID_CODE);
            }
            return body.get("access_token").asText();
        } catch (HttpClientErrorException e) {          // 4xx: client_id/secret 문제
            throw new BusinessException(ErrorCode.GITHUB_INVALID_CODE);
        } catch (RestClientException e) {               // 5xx·IO: GitHub 서버/통신 오류
            throw new BusinessException(ErrorCode.GITHUB_SERVER_ERROR);
        }
    }
}

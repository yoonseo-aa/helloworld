package com.helloworld.domain.auth.client;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import org.springframework.http.HttpHeaders;
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
 * 구글 OAuth 연동 클라이언트.
 * 프론트가 넘긴 인가 코드를 (1) 토큰 엔드포인트에서 access token으로 교환하고,
 * (2) userinfo 엔드포인트에서 사용자 정보(sub/email/name/picture)를 조회한다.
 *
 * 인가 코드 만료·재사용·위조(4xx) → AUTH_INVALID_SOCIAL_CODE,
 * 그 외 구글 서버/통신 오류(5xx·IO) → AUTH_SOCIAL_SERVER_ERROR 로 변환한다.
 */
@Component
public class GoogleOAuthClient {

    private final GoogleOAuthProperties props;
    private final RestClient restClient;

    public GoogleOAuthClient(GoogleOAuthProperties props, RestClient.Builder restClientBuilder) {
        this.props = props;
        // 구글 응답 지연 시 워커 스레드가 무한정 묶이지 않도록 타임아웃 지정
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = restClientBuilder.requestFactory(factory).build();
    }

    /** 인가 코드로 사용자 정보를 얻는다. (토큰 교환 → userinfo 조회) */
    public GoogleUserInfo getUserInfo(String code, String redirectUri) {
        String googleAccessToken = exchangeCodeForToken(code, redirectUri);
        return fetchUserInfo(googleAccessToken);
    }

    /** 인가 코드 + client_secret → 구글 access token 교환 (application/x-www-form-urlencoded) */
    private String exchangeCodeForToken(String code, String redirectUri) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", props.getClientId());
        form.add("client_secret", props.getClientSecret());
        form.add("redirect_uri", redirectUri);
        form.add("grant_type", "authorization_code");

        try {
            GoogleTokenResponse response = restClient.post()
                    .uri(props.getTokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(GoogleTokenResponse.class);

            if (response == null || response.accessToken() == null) {
                throw new BusinessException(ErrorCode.AUTH_SOCIAL_SERVER_ERROR);
            }
            return response.accessToken();
        } catch (HttpClientErrorException e) {         // 4xx: 인가 코드 문제
            throw new BusinessException(ErrorCode.AUTH_INVALID_SOCIAL_CODE);
        } catch (RestClientException e) {              // 5xx·IO: 구글 서버/통신 오류
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_SERVER_ERROR);
        }
    }

    /** access token으로 userinfo 조회 */
    private GoogleUserInfo fetchUserInfo(String googleAccessToken) {
        try {
            GoogleUserInfo info = restClient.get()
                    .uri(props.getUserinfoUri())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + googleAccessToken)
                    .retrieve()
                    .body(GoogleUserInfo.class);

            if (info == null || info.sub() == null) {
                throw new BusinessException(ErrorCode.AUTH_SOCIAL_SERVER_ERROR);
            }
            return info;
        } catch (HttpClientErrorException e) {
            throw new BusinessException(ErrorCode.AUTH_INVALID_SOCIAL_CODE);
        } catch (RestClientException e) {
            throw new BusinessException(ErrorCode.AUTH_SOCIAL_SERVER_ERROR);
        }
    }

    /** 토큰 응답 (필요한 access_token만 사용, 나머지 필드는 무시) */
    public record GoogleTokenResponse(@JsonProperty("access_token") String accessToken) {}

    /** 구글 사용자 정보. sub = 구글 고유 ID(=social_id), 구글은 email·name 기본 제공. */
    public record GoogleUserInfo(
            @JsonProperty("sub") String sub,
            @JsonProperty("email") String email,
            @JsonProperty("name") String name,
            @JsonProperty("picture") String picture) {}
}

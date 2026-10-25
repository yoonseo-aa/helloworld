package com.helloworld.domain.post.summary.client;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 게시물에 연결된 GitHub 저장소에서 요약 재료를 가져온다. (README · 언어 통계 · 설명문)
 *
 * <p><b>왜 GraphQL이 아니라 REST인가</b> — 잔디 쪽({@code GithubGraphQlClient})은 사용자의
 * 1년치 활동을 한 번에 긁어야 해서 GraphQL이 필수였다. 여기는 저장소 하나의 파일과
 * 메타데이터만 있으면 되고, README 원문은 <b>GraphQL로 받기가 오히려 번거롭다</b>
 * (Blob 타입 캐스팅이 필요하고 기본 브랜치 이름을 먼저 알아야 한다).
 * REST의 {@code /readme} 는 기본 브랜치를 알아서 찾아준다.
 *
 * <p><b>토큰</b> — 서버용 토큰({@code GITHUB_API_TOKEN}) 하나를 쓴다. 없어도 공개 저장소는
 * 읽히지만, 인증이 없으면 레이트리밋이 <b>IP당 시간당 60회</b>라 게시물이 조금만 몰려도 막힌다.
 * 토큰을 넣으면 5000회가 되므로 사실상 필수에 가깝다.
 *
 * <p>비공개 저장소는 읽지 못한다. 작성자 개인 토큰을 쓰면 가능하지만, 그러려면 이 도메인이
 * GitHub 연동(토큰 저장·복호화)에 의존해야 한다. 그 기능이 develop에 들어온 뒤에
 * 토큰을 꺼내는 부분만 갈아끼우면 되므로, 지금은 결합을 만들지 않는다.
 */
@Slf4j
@Component
public class GithubRepoClient {

    private static final String API_BASE = "https://api.github.com";

    /** GitHub REST의 현재 권장 Accept 값. 지정하지 않으면 응답 형식이 미래에 바뀔 수 있다. */
    private static final String ACCEPT = "application/vnd.github+json";

    private final RestClient restClient;

    /**
     * 서버용 GitHub 토큰. 비어 있으면 익명으로 호출한다(시간당 60회 제한).
     * 권한은 public repo 읽기만 있으면 충분하다 — 이 클라이언트는 조회만 한다.
     */
    @Value("${github.api-token:}")
    private String apiToken;

    public GithubRepoClient(RestClient.Builder restClientBuilder) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.restClient = restClientBuilder.requestFactory(factory).build();
    }

    /**
     * 게시물의 github_url 에서 {@code owner/repo} 를 뽑는다.
     *
     * <p>사용자가 붙여넣는 주소는 형태가 제각각이다 — 끝에 {@code .git}이 붙거나,
     * 슬래시가 더 있거나, {@code /tree/main} 같은 하위 경로가 딸려 온다.
     * 앞의 두 조각만 취하고 나머지는 버린다.
     *
     * @return 파싱에 실패하면 비어 있음. 잘못된 URL은 예외가 아니라 "요약 없음"으로 흘러가야 한다.
     */
    public static Optional<RepoRef> parseRepoRef(String githubUrl) {
        if (!StringUtils.hasText(githubUrl)) {
            return Optional.empty();
        }
        try {
            URI uri = URI.create(githubUrl.trim());
            String host = uri.getHost();
            if (host == null || !host.endsWith("github.com")) {
                return Optional.empty();
            }
            String[] parts = uri.getPath().replaceAll("^/+", "").split("/");
            if (parts.length < 2 || parts[0].isBlank() || parts[1].isBlank()) {
                return Optional.empty();
            }
            String repo = parts[1].endsWith(".git")
                    ? parts[1].substring(0, parts[1].length() - 4)
                    : parts[1];
            return Optional.of(new RepoRef(parts[0], repo));
        } catch (IllegalArgumentException e) {
            // URI로 읽히지도 않는 문자열. 사용자 입력이라 흔하다.
            return Optional.empty();
        }
    }

    /**
     * README 원문(마크다운).
     *
     * <p>README가 없는 저장소는 404를 준다 — 오류가 아니라 <b>정상적인 상태</b>이므로
     * 빈 값으로 돌려준다. 그 경우 호출자가 저장소 메타만으로 최소 요약을 만든다.
     */
    public Optional<String> fetchReadme(RepoRef ref) {
        JsonNode body = get("/repos/%s/%s/readme".formatted(ref.owner(), ref.repo()));
        if (body == null || !body.hasNonNull("content")) {
            return Optional.empty();
        }
        // GitHub은 파일 내용을 Base64로 준다. 줄바꿈이 섞여 있어 일반 디코더로는 터지므로
        // 개행을 무시하는 MIME 디코더를 쓴다.
        try {
            byte[] decoded = Base64.getMimeDecoder().decode(body.get("content").asText());
            return Optional.of(new String(decoded, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            log.warn("README Base64 디코딩 실패 - {}/{}", ref.owner(), ref.repo());
            return Optional.empty();
        }
    }

    /**
     * 언어별 코드량(바이트).
     *
     * <p>이 값은 GitHub이 실제 파일을 집계한 것이라 <b>추론이 아니다.</b> 그래서 README가
     * 없어도 기술스택으로 보여줄 수 있다. 다만 언어만 나오므로 Three.js·Vite 같은
     * 라이브러리는 여기 없다 — 그건 README에서만 얻을 수 있다.
     */
    public Map<String, Long> fetchLanguages(RepoRef ref) {
        JsonNode body = get("/repos/%s/%s/languages".formatted(ref.owner(), ref.repo()));
        Map<String, Long> languages = new LinkedHashMap<>();
        if (body == null) {
            return languages;
        }
        body.fields().forEachRemaining(e -> languages.put(e.getKey(), e.getValue().asLong()));
        return languages;
    }

    /** 저장소 설명문. 사용자가 직접 쓴 값이라 README가 없을 때 한 줄 소개로 쓸 수 있다. */
    public Optional<String> fetchDescription(RepoRef ref) {
        JsonNode body = get("/repos/%s/%s".formatted(ref.owner(), ref.repo()));
        if (body == null || !body.hasNonNull("description")) {
            return Optional.empty();
        }
        String description = body.get("description").asText().trim();
        return description.isEmpty() ? Optional.empty() : Optional.of(description);
    }


    /**
     * 사용자의 <b>공개</b> 저장소 목록. 작성 폼의 저장소 선택에 쓴다.
     *
     * <p>비공개 저장소는 나오지 않는다. 그러려면 사용자 개인 OAuth 토큰이 필요한데,
     * 어차피 요약도 공개 저장소만 만들 수 있으므로 목록과 결과가 어긋나지 않는다.
     *
     * <p>{@code sort=pushed} 로 최근 작업한 순서다 — 방금 만든 프로젝트를 올리는 게
     * 보통이라 그쪽이 위에 있어야 찾기 쉽다. 포크는 제외한다(남의 코드다).
     *
     * @param username GitHub 사용자명
     * @return 사용자가 없거나 조회에 실패하면 빈 목록
     */
    public List<Map<String, Object>> fetchUserRepos(String username, int limit) {
        JsonNode body = get("/users/%s/repos?sort=pushed&direction=desc&type=owner&per_page=%d"
                .formatted(username, limit));
        if (body == null || !body.isArray()) {
            return List.of();
        }
        List<Map<String, Object>> repos = new ArrayList<>();
        for (JsonNode node : body) {
            if (node.path("fork").asBoolean(false)) {
                continue;   // 포크 제외
            }
            Map<String, Object> repo = new LinkedHashMap<>();
            repo.put("id", node.path("id").asLong());
            repo.put("name", node.path("name").asText());
            repo.put("fullName", node.path("full_name").asText());
            repo.put("htmlUrl", node.path("html_url").asText());
            repo.put("description", node.hasNonNull("description") ? node.get("description").asText() : null);
            repo.put("language", node.hasNonNull("language") ? node.get("language").asText() : null);
            repo.put("pushedAt", node.path("pushed_at").asText(""));
            repos.add(repo);
        }
        return repos;
    }
    /**
     * 공통 GET.
     *
     * <p><b>실패를 예외로 올리지 않는다.</b> 요약은 게시물의 부가 정보라, 저장소가 삭제됐거나
     * 비공개로 바뀌었다고 해서 게시물 작성 자체가 실패해서는 안 된다. 로그만 남기고 null.
     */
    private JsonNode get(String path) {
        try {
            RestClient.RequestHeadersSpec<?> spec = restClient.get()
                    .uri(API_BASE + path)
                    .header(HttpHeaders.ACCEPT, ACCEPT);

            if (StringUtils.hasText(apiToken)) {
                spec = spec.header(HttpHeaders.AUTHORIZATION, "Bearer " + apiToken);
            }
            return spec.retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            // 404(README 없음·저장소 없음), 403(레이트리밋), 401(토큰 만료) 모두 여기로 온다.
            // 어느 쪽이든 요약을 만들지 못한다는 결론은 같으므로 구분하지 않는다.
            log.info("GitHub 저장소 조회 실패 - path={}, 원인={}", path, e.getMessage());
            return null;
        }
    }

    /** 저장소 좌표. */
    public record RepoRef(String owner, String repo) {
        public String fullName() {
            return owner + "/" + repo;
        }
    }
}

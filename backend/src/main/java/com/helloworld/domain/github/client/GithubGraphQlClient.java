package com.helloworld.domain.github.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GitHub 통계(일별 커밋 수 + 언어별 코드량) 조회 클라이언트.
 * 신원 조회까지 <b>이 한 번의 요청</b>으로 끝낸다.
 *
 * <p><b>왜 GraphQL인가</b> — 일자별 커밋 수는 REST에 없다. Search Commits로 세면
 * 검색 API의 1000건 상한에 걸리고 30req/min 제한 때문에 배치가 감당하지 못한다.
 * 언어 통계도 REST로는 저장소마다 {@code /languages}를 따로 호출해야 해서 왕복이 폭증한다.
 *
 * <p><b>왜 contributionCalendar가 아닌가</b> — 같은 collection 안에 있지만 그건
 * commit + PR + issue + review 합계다. "순수 커밋"을 원하므로
 * {@code commitContributionsByRepository}를 쓴다. 대신 저장소별로 쪼개져 오기 때문에
 * 날짜별로 합산하는 건 이쪽 몫이다.
 *
 * <p><b>왜 user(login:)이 아니라 viewer인가</b> — {@code user(login: $login)}은 사용자가
 * GitHub 계정명을 바꾸는 순간 저장해 둔 login이 낡아 null을 돌려준다. 그러면 배치가
 * 조용히 실패하고 아무도 모르는 채 잔디만 멈춘다. {@code viewer}는 토큰 자체가 신원이라
 * 늙지 않는다. 덤으로 databaseId·login까지 함께 와서 REST {@code /user} 호출이 사라진다.
 *
 * <p><b>왜 1년을 조각내서 요청하나</b> — GitHub은 모든 connection의 {@code first}를
 * <b>1~100으로 제한</b>한다. 넘기면 데이터가 잘리는 게 아니라 쿼리 검증 자체가 실패해서
 * {@code data: null} + {@code errors} 가 HTTP 200으로 돌아온다.
 * 처음엔 "한 저장소의 커밋일은 최대 366일이니 {@code first: 366}이면 한 번에 다 온다"고
 * 두었는데, 그 값 때문에 <b>연동이 100% 실패했다</b>.
 *
 * <p>그래서 1년을 {@value #MAX_DAYS_PER_WINDOW}일 이하 구간 4개로 쪼개고, GraphQL 별칭
 * ({@code w0}~{@code w3})으로 <b>한 번의 요청에</b>담는다. 한 구간이 100일을 넘지 않으므로
 * 한 저장소가 그 구간에 커밋한 날도 100일을 넘을 수 없어 {@code first: 100}에서 절대 잘리지 않는다.
 * 커서 페이지네이션 없이 상한을 지킬 수 있는 이유다.
 *
 * <p><b>레이트리밋</b> — 노드 수 기준으로 약 400 point를 쓴다.
 * 5000 point/hr이 <b>토큰 소유자 기준</b>이고 사용자마다 자기 토큰으로 조회하므로
 * 사용자 수가 늘어도 예산이 나뉘지 않는다.
 */
@Slf4j
@Component
public class GithubGraphQlClient {

    /**
     * GitHub이 허용하는 페이지 인자({@code first} / {@code maxRepositories})의 절대 상한.
     * 아래 값들은 전부 이 이하여야 한다 — 아니면 응답이 잘리는 게 아니라 요청이 거절된다.
     */
    private static final int GITHUB_MAX_PAGE_SIZE = 100;

    /** 이 값을 넘는 저장소에 커밋했다면 뒷부분이 잘린다. 잘림은 감지해서 경고만 남긴다. */
    private static final int MAX_REPOSITORIES = 100;

    /**
     * GitHub이 허용하는 connection {@code first}의 상한.
     * <b>넘기면 잘리는 게 아니라 쿼리 검증이 실패한다.</b> 절대 올리지 말 것.
     */
    private static final int MAX_CONNECTION_PAGE = 100;

    /**
     * 한 번에 요청할 구간의 최대 일수. {@link #MAX_CONNECTION_PAGE}보다 작아야 한다 —
     * 한 저장소가 N일짜리 구간에 커밋할 수 있는 날은 아무리 많아야 N일이므로,
     * 구간이 100일 미만이면 {@code contributions(first: 100)}이 잘릴 수 없다.
     * 366일 ÷ 92일 = 4조각.
     */
    private static final int MAX_DAYS_PER_WINDOW = 92;

    /** 언어 통계용 저장소 수. 한 저장소에서 상위 몇 개 언어까지 볼지도 함께 제한한다. */
    private static final int MAX_LANGUAGE_REPOSITORIES = 100;
    private static final int MAX_LANGUAGES_PER_REPOSITORY = 10;

    /*
     * 상한을 넘긴 값은 "조금 잘린 결과"가 아니라 쿼리 검증 실패(= 연동 전면 실패)를 부른다.
     * 실제로 contributions(first: 366) 하나 때문에 연동이 100% 실패했고, 증상이
     * "GitHub 서버 오류"로만 보여서 원인을 찾는 데 오래 걸렸다.
     *
     * 그래서 기동 시점에 검증한다. 나중에 누가 숫자를 올리면 앱이 뜨지 않고 이유를 말해 준다 —
     * 사용자가 연동 버튼을 누르는 순간에 알게 되는 것보다 훨씬 낫다.
     */
    static {
        requireWithinGithubLimit("MAX_REPOSITORIES", MAX_REPOSITORIES);
        requireWithinGithubLimit("MAX_CONNECTION_PAGE", MAX_CONNECTION_PAGE);
        requireWithinGithubLimit("MAX_LANGUAGE_REPOSITORIES", MAX_LANGUAGE_REPOSITORIES);
        requireWithinGithubLimit("MAX_LANGUAGES_PER_REPOSITORY", MAX_LANGUAGES_PER_REPOSITORY);

        if (MAX_DAYS_PER_WINDOW > MAX_CONNECTION_PAGE) {
            throw new IllegalStateException(
                    "MAX_DAYS_PER_WINDOW(%d)가 MAX_CONNECTION_PAGE(%d)보다 큽니다. 한 구간의 일수가 "
                    .formatted(MAX_DAYS_PER_WINDOW, MAX_CONNECTION_PAGE)
                    + "페이지 상한을 넘으면 커밋이 많은 저장소에서 조용히 잘립니다.");
        }
    }

    private static void requireWithinGithubLimit(String name, int value) {
        if (value < 1 || value > GITHUB_MAX_PAGE_SIZE) {
            throw new IllegalStateException(
                    "%s=%d 는 GitHub 상한(1~%d)을 벗어납니다. 이 값으로는 쿼리 검증이 실패해 "
                            .formatted(name, value, GITHUB_MAX_PAGE_SIZE)
                    + "GitHub 연동이 전부 실패합니다.");
        }
    }

    /**
     * 구간 개수만큼 {@code contributionsCollection} 별칭을 붙여 쿼리를 만든다.
     *
     * <p>별칭({@code w0:}, {@code w1:} …)은 같은 필드를 서로 다른 인자로 여러 번 요청하기
     * 위한 GraphQL 문법이다. 이것 덕분에 구간을 넷으로 쪼개도 <b>HTTP 왕복은 한 번</b>이다.
     *
     * <p>repositories 조건에 대하여:
     * <ul>
     *   <li>{@code ownerAffiliations: OWNER} — 본인 소유 저장소만. 조직·협업 저장소를 넣으면
     *       살짝 기여한 큰 저장소의 언어가 통째로 잡혀 과대 평가된다.</li>
     *   <li>{@code isFork: false} — 포크 제외. 남의 코드가 내 기술스택으로 잡히면 안 된다.</li>
     *   <li>{@code orderBy PUSHED_AT DESC} — 100개 상한에 걸릴 때 최근 작업한 저장소가 남도록.</li>
     * </ul>
     */
    private static String buildStatsQuery(int windowCount) {
        StringBuilder params = new StringBuilder();
        StringBuilder windows = new StringBuilder();

        for (int i = 0; i < windowCount; i++) {
            if (i > 0) {
                params.append(", ");
            }
            params.append("$from%d: DateTime!, $to%d: DateTime!".formatted(i, i));

            windows.append("""
                        w%d: contributionsCollection(from: $from%d, to: $to%d) {
                          commitContributionsByRepository(maxRepositories: %d) {
                            repository { nameWithOwner isPrivate }
                            contributions(first: %d) {
                              nodes { occurredAt commitCount }
                            }
                          }
                        }
                    """.formatted(i, i, i, MAX_REPOSITORIES, MAX_CONNECTION_PAGE));
        }

        return """
                query(%s) {
                  viewer {
                    databaseId
                    login
                    repositories(first: %d, isFork: false, ownerAffiliations: [OWNER],
                                 orderBy: {field: PUSHED_AT, direction: DESC}) {
                      nodes {
                        languages(first: %d, orderBy: {field: SIZE, direction: DESC}) {
                          edges { size node { name } }
                        }
                      }
                    }
                %s  }
                }
                """.formatted(params, MAX_LANGUAGE_REPOSITORIES, MAX_LANGUAGES_PER_REPOSITORY,
                              windows);
    }

    /**
     * from~to를 {@link #MAX_DAYS_PER_WINDOW}일 이하 구간들로 <b>겹치지 않게</b> 나눈다.
     *
     * <p>겹치면 같은 날 커밋이 두 번 합산돼 잔디가 실제보다 진해진다. 구간 끝 다음 날에서
     * 이어 시작하므로 겹침도, 빈 구간도 생기지 않는다.
     */
    static List<DateWindow> splitWindows(LocalDate from, LocalDate to) {
        List<DateWindow> windows = new ArrayList<>();
        LocalDate cursor = from;
        while (!cursor.isAfter(to)) {
            LocalDate end = cursor.plusDays(MAX_DAYS_PER_WINDOW - 1L);
            if (end.isAfter(to)) {
                end = to;
            }
            windows.add(new DateWindow(cursor, end));
            cursor = end.plusDays(1);
        }
        return windows;
    }

    /** 조회 구간 한 조각(양 끝 포함). */
    record DateWindow(LocalDate from, LocalDate to) {}

    /**
     * GitHub의 {@code DateTime} 스칼라에 넣을 형식. <b>초까지 반드시 있어야 한다.</b>
     *
     * <p>{@code OffsetDateTime.toString()}을 쓰면 안 된다 — 초가 0일 때 생략해서
     * {@code "2025-08-06T00:00Z"} 를 만들고, GitHub은 이걸
     * {@code Could not coerce value "2025-08-06T00:00Z" to DateTime} 으로 거절한다.
     * 자정(00:00:00)인 from만 걸리고 23:59:59인 to는 멀쩡해서, 증상이
     * "GitHub 서버 오류"로만 보이고 원인이 드러나지 않는다. 그래서 형식을 명시한다.
     */
    private static final DateTimeFormatter GITHUB_DATE_TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    private final GithubOAuthProperties props;
    private final RestClient restClient;

    public GithubGraphQlClient(GithubOAuthProperties props, RestClient.Builder restClientBuilder) {
        this.props = props;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        // 1년치 + 저장소 100개 응답은 제법 크다. 토큰 교환보다 여유를 둔다.
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.restClient = restClientBuilder.requestFactory(factory).build();
    }

    /**
     * 토큰 주인의 신원 + from~to 구간 일별 커밋 수 + 언어별 코드량을 한 번에 가져온다.
     *
     * <p>커밋이 없는 날은 결과에 들어 있지 않다. 화면에 필요한 0은 조회 응답을 만들 때 채운다.
     *
     * @param accessToken 사용자의 GitHub access token (평문)
     */
    public GithubSnapshot fetchSnapshot(String accessToken, LocalDate from, LocalDate to) {
        List<DateWindow> windows = splitWindows(from, to);

        // DateTime 타입이라 시각까지 필요하다. to는 그날 끝까지 포함되도록 23:59:59로 보낸다.
        Map<String, Object> variables = new LinkedHashMap<>();
        for (int i = 0; i < windows.size(); i++) {
            DateWindow w = windows.get(i);
            variables.put("from" + i, w.from().atStartOfDay().format(GITHUB_DATE_TIME));
            variables.put("to" + i, w.to().atTime(23, 59, 59).format(GITHUB_DATE_TIME));
        }

        JsonNode body;
        try {
            body = restClient.post()
                    .uri(props.getGraphqlUri())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("query", buildStatsQuery(windows.size()), "variables", variables))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (HttpClientErrorException.Unauthorized e) {
            // 사용자가 앱 권한을 취소했거나 토큰이 폐기됨 → 재연동이 필요하다.
            throw new BusinessException(ErrorCode.GITHUB_TOKEN_EXPIRED);
            // HttpClientErrorException은 RestClientException의 하위 타입이라 multi-catch로 묶을 수 없다.
            // (Java: "Alternatives in a multi-catch statement cannot be related by subclassing")
        } catch (RestClientException e) {
            throw new BusinessException(ErrorCode.GITHUB_SERVER_ERROR);
        }

        if (body == null) {
            throw new BusinessException(ErrorCode.GITHUB_SERVER_ERROR);
        }

        // GraphQL은 쿼리·권한 오류도 HTTP 200 + errors 배열로 준다. 상태 코드만 보면 놓친다.
        // 다만 errors가 있어도 data가 함께 오는 부분 실패가 있으므로(예: 접근 불가한 조직 저장소),
        // errors만 보고 통째로 실패시키지 않는다. 매일 도는 배치가 그런 사용자에게서
        // 영영 멈추는 것보다는, 경고를 남기고 받은 만큼이라도 반영하는 편이 낫다.
        boolean hasErrors = body.has("errors");
        if (hasErrors) {
            log.warn("GitHub GraphQL 오류 응답(부분 실패 가능): {}", body.path("errors"));
        }

        JsonNode viewer = body.path("data").path("viewer");
        if (!viewer.hasNonNull("databaseId") || !viewer.hasNonNull("login")) {
            // data가 아예 없으면 부분 실패가 아니라 요청 자체가 실패한 것이다.
            throw new BusinessException(
                    hasErrors ? ErrorCode.GITHUB_SERVER_ERROR : ErrorCode.GITHUB_USER_NOT_FOUND);
        }

        return new GithubSnapshot(
                viewer.get("databaseId").asLong(),
                viewer.get("login").asText(),
                parseDailyCommits(viewer, windows.size()),
                parseLanguages(viewer));
    }

    /**
     * 구간별 · 저장소별로 쪼개져 오는 커밋을 날짜별로 합산한다.
     *
     * <p>구간({@code w0}~)이 서로 겹치지 않으므로 단순 합산으로 안전하다
     * ({@link #splitWindows} 참고).
     */
    private Map<LocalDate, DailyCommit> parseDailyCommits(JsonNode viewer, int windowCount) {
        // 예: 8/3에 A저장소 2건 + B저장소 7건 → 9건.
        // LinkedHashMap은 순서 보존용이 아니라 디버깅 시 삽입 순서를 따라가기 쉬우라고 쓴다.
        Map<LocalDate, DailyCommit> byDate = new LinkedHashMap<>();

        for (int i = 0; i < windowCount; i++) {
            JsonNode repositories = viewer.path("w" + i).path("commitContributionsByRepository");

            for (JsonNode repo : repositories) {
                boolean isPrivate = repo.path("repository").path("isPrivate").asBoolean(false);

                for (JsonNode node : repo.path("contributions").path("nodes")) {
                    // occurredAt은 DateTime이지만 일 단위 집계라 시각은 항상 00:00:00Z다. 날짜만 쓴다.
                    // 값이 비어 오는 일은 없어야 하지만, substring이 그대로 터지면 배치가 이 계정에서
                    // 원인 불명으로 죽는다. 건너뛰고 로그를 남기는 편이 낫다.
                    String occurredAt = node.path("occurredAt").asText("");
                    if (occurredAt.length() < 10) {
                        log.warn("GitHub 커밋 조회 - occurredAt이 비어 있어 건너뜁니다. node={}", node);
                        continue;
                    }
                    LocalDate date = LocalDate.parse(occurredAt.substring(0, 10));
                    int count = node.path("commitCount").asInt();

                    byDate.merge(date,
                            isPrivate ? new DailyCommit(0, count) : new DailyCommit(count, 0),
                            DailyCommit::plus);
                }
            }

            if (repositories.size() >= MAX_REPOSITORIES) {
                // 잘렸을 가능성이 있다. 잔디가 실제보다 적게 보이므로 흔적을 남긴다.
                log.warn("GitHub 커밋 조회 - 저장소 수가 상한({})에 도달했습니다(구간 {}). "
                        + "일부 저장소가 누락될 수 있습니다.", MAX_REPOSITORIES, i);
            }
        }
        return byDate;
    }

    /**
     * 저장소별 언어 바이트를 전부 합산한다.
     *
     * <p>여기서는 비율을 계산하지 않고 <b>원본 바이트 그대로</b> 돌려준다.
     * 상위 N개·최소 비율 같은 표시 규칙은 조회 시점에 적용해야 기준이 바뀌어도
     * 전 사용자 재동기화가 필요 없다.
     */
    private Map<String, Long> parseLanguages(JsonNode viewer) {
        Map<String, Long> byLanguage = new LinkedHashMap<>();

        for (JsonNode repo : viewer.path("repositories").path("nodes")) {
            for (JsonNode edge : repo.path("languages").path("edges")) {
                String name = edge.path("node").path("name").asText("");
                if (name.isEmpty()) {
                    continue;
                }
                byLanguage.merge(name, edge.path("size").asLong(), Long::sum);
            }
        }
        return byLanguage;
    }

    /**
     * 토큰 주인의 신원 + 통계.
     *
     * @param dailyCommits 커밋이 있는 날짜만 담긴다. 0인 날은 아예 키가 없다.
     * @param languages    언어명 → 코드 바이트 수. 비율이 아니라 원본 값이다.
     */
    public record GithubSnapshot(Long githubId, String login,
                                 Map<LocalDate, DailyCommit> dailyCommits,
                                 Map<String, Long> languages) {}

    /** 하루치 커밋 수를 공개/비공개로 나눠 담는다. */
    public record DailyCommit(int publicCount, int privateCount) {
        /** 같은 날짜가 저장소별로 여러 번 오므로 합친다. Map.merge의 재매핑 함수로 쓰인다. */
        public DailyCommit plus(DailyCommit other) {
            return new DailyCommit(publicCount + other.publicCount,
                    privateCount + other.privateCount);
        }
    }
}

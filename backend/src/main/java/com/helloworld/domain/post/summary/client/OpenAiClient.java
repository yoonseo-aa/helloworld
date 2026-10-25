package com.helloworld.domain.post.summary.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Semaphore;

/**
 * README를 구조화된 프로젝트 요약으로 바꾸는 OpenAI 클라이언트.
 *
 * <p><b>Chat Completions + Structured Outputs</b>를 쓴다({@code POST /v1/chat/completions},
 * {@code response_format.type = "json_schema"}, {@code strict: true}).
 * 자유 텍스트로 받으면 모델이 가끔 마크다운 코드펜스로 감싸거나 필드를 빠뜨리고,
 * 그때부터 파싱 방어 코드가 계속 늘어난다. 스키마를 강제하면 그 문제가 아예 없어진다.
 *
 * <p><b>왜 Responses API가 아닌가</b> — OpenAI는 신규 프로젝트에 Responses API를 권하지만,
 * 이 프로젝트는 SSAFY GMS 프록시({@code gms.ssafy.io/gmsapi/api.openai.com})를 거친다.
 * GMS 문서가 예시로 제시하는 경로가 {@code /v1/chat/completions} 하나뿐이라,
 * 문서로 확인된 쪽을 쓴다. 두 API 모두 Structured Outputs를 지원하므로 얻는 결과는 같다.
 *
 * <p><b>실패를 예외로 올리지 않는다.</b> 요약은 게시물의 부가 정보다. OpenAI가 느리거나
 * 레이트리밋에 걸렸다고 게시물 작성이 실패하면 안 된다. 비어 있는 값을 돌려주고,
 * 호출자는 {@code ai_summary}를 비워둔 채 넘어간다.
 */
@Slf4j
@Component
public class OpenAiClient {

    /**
     * 응답 스키마의 이름. 모델에게 "무엇을 만드는지" 알려주는 힌트로도 쓰인다.
     */
    private static final String SCHEMA_NAME = "project_summary";

    private static final String SYSTEM_PROMPT = """
            너는 개발자 SNS의 프로젝트 요약기다. 입력으로 GitHub 저장소의 README를 받고,
            요약 패널에 넣을 구조화된 요약을 만든다.

            규칙:
            - 반드시 한국어로 답한다. 기술 용어·라이브러리명은 원문 표기를 유지한다.
            - README에 실제로 적힌 내용만 쓴다. 없는 기능을 추측해서 채우지 않는다.
            - 근거가 부족한 항목은 빈 배열이나 빈 문자열로 둔다. 억지로 채우지 않는다.
            - "혁신적인", "최고의" 같은 홍보 문구를 쓰지 않는다. 무엇을 하는 물건인지만 적는다.
            - tech_stacks 에는 아래 "확인된 언어"를 그대로 포함하고, README에 명시된
              프레임워크·라이브러리·빌드도구만 덧붙인다. 언어를 임의로 빼거나 바꾸지 않는다.
              package.json 같은 파일이 README에 인용돼 있지 않다면 그 내용을 추측하지 않는다.

            항목 분량:
            - one_liner: 한 문장, 100자 이내
            - purpose: 1~2문장, 200자 이내
            - key_features: 3~5개, 각 40자 이내. 이 프로젝트가 사용자에게 해주는 일
            - tech_stacks: 최대 8개, 중요도 순

            highlights — "프로젝트 특징" 칸이다. 여기가 가장 자주 망가진다:
            - 기능을 다시 쓰는 자리가 아니다. one_liner·purpose·key_features·tech_stacks 에
              이미 등장한 말을 반복하면 화면에서 같은 문장을 두 번 읽게 된다.
              앞 항목에 쓴 단어(라이브러리명 포함)는 여기서 다시 쓰지 않는다.
            - 대신 "저장소를 열어봐야 알 수 있는 사실"을 쓴다. 예를 들면
              구조(프론트·백엔드 저장소 분리, 모노레포), 실행 조건(API 키·로그인 필요 여부),
              의존하는 외부 서비스의 수, 배포 방식, 데이터 출처.
            - "직관적인 UI", "누구나 쉽게" 같은 평가는 쓰지 않는다. 확인할 수 없는 말이다.
            - 3~4개, 각 30자 이내. 근거가 없으면 개수를 채우지 말고 줄인다. 빈 배열도 괜찮다.
            """;

    /**
     * 동시에 진행할 수 있는 OpenAI 호출 수.
     *
     * <p><b>왜 필요한가</b> — 이 호출은 응답이 올 때까지 요청 스레드를 붙잡는다.
     * 톰캣 기본 스레드가 200개인데 요약 요청이 몰리면 그 스레드들이 전부 LLM을 기다리며
     * 묶이고, 그동안 <b>피드·로그인 같은 평범한 요청도 처리하지 못한다.</b>
     * 느려지는 게 요약 하나가 아니라 서비스 전체가 되는 것이 문제다.
     *
     * <p>5로 잡은 근거: 읽기 타임아웃이 30초이므로 최악의 경우에도 묶이는 스레드는 5개다.
     * 200개 중 5개면 나머지 195개로 일반 트래픽을 계속 받는다. 반대로 이 값을 크게 잡으면
     * 제한을 두는 의미가 없어진다.
     */
    private static final int MAX_IN_FLIGHT = 5;

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    /** 진행 중 호출 수 제한. 대기 없이 즉시 판정한다 — 위 상수 주석 참고. */
    private final Semaphore inFlight = new Semaphore(MAX_IN_FLIGHT);

    public OpenAiClient(OpenAiProperties props, ObjectMapper objectMapper,
                        RestClient.Builder restClientBuilder) {
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        // LLM 응답은 느리다. 짧게 잡으면 정상 요청이 타임아웃으로 버려진다.
        //
        // 60초에서 30초로 낮췄다. 이 값이 곧 요청 스레드가 묶이는 최대 시간이라
        // 스레드 회전율을 그대로 결정한다. 30초를 넘겨 기다리는 사용자는 이미 이탈한 뒤이고,
        // 실패해도 예외를 던지지 않으므로 "요약 없음"으로 자연스럽게 떨어진다.
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = restClientBuilder.requestFactory(factory).build();
    }

    /** API 키가 없거나 스위치가 꺼져 있으면 요약 단계를 통째로 건너뛴다. */
    public boolean isUsable() {
        return props.isEnabled() && StringUtils.hasText(props.getApiKey());
    }

    /**
     * 실제로 사용한 모델 이름. 요약과 함께 저장해 둔다 —
     * 모델을 바꿨을 때 "이 요약이 옛 모델 것인지" 알 수 없으면 재생성 판단을 못 한다.
     */
    public String getModel() {
        return props.getModel();
    }

    /**
     * README → 구조화 요약.
     *
     * @param repoFullName 예: {@code owner/repo}. 모델에게 맥락을 주는 용도다.
     * @param readme       README 원문. 길면 잘라서 보낸다.
     * @param languages    {@code /languages} 로 확인된 언어. 사실이므로 모델이 바꾸지 못하게 못 박는다.
     * @return 실패하면 비어 있음
     */
    public Optional<LlmSummary> summarize(String repoFullName, String readme, List<String> languages) {
        if (!isUsable()) {
            // 조용히 넘어가면 결과만 보고는 "키가 없어서"인지 "호출이 실패해서"인지 알 수 없다.
            // 둘 다 REPO_META 로 떨어지기 때문이다.
            log.warn("OpenAI 요약 건너뜀 - enabled={}, api-key {} → REPO_META 경로로 갑니다.",
                    props.isEnabled(),
                    StringUtils.hasText(props.getApiKey()) ? "있음" : "비어 있음");
            return Optional.empty();
        }

        String trimmed = readme.length() > props.getMaxReadmeChars()
                ? readme.substring(0, props.getMaxReadmeChars())
                : readme;

        String userPrompt = """
                저장소: %s
                확인된 언어(바이트순): %s
                README:
                ---
                %s
                ---
                """.formatted(repoFullName, String.join(", ", languages), trimmed);

        if (!inFlight.tryAcquire()) {
            // 대기시키지 않고 바로 포기한다. 이미 최대 대기 시간이 읽기 타임아웃(30초)인데
            // 여기서 줄까지 서면 사용자는 그 두 배를 기다린다. 요약은 없어도 되는 값이므로
            // "지금은 만들지 않는다"가 "오래 기다린다"보다 낫다.
            log.warn("OpenAI 요약 건너뜀 - 동시 호출 한도({})에 걸렸습니다. repo={}",
                    MAX_IN_FLIGHT, repoFullName);
            return Optional.empty();
        }

        try {
            JsonNode body = restClient.post()
                    .uri(props.getBaseUrl() + "/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + props.getApiKey())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody(userPrompt))
                    .retrieve()
                    .body(JsonNode.class);

            if (body == null) {
                return Optional.empty();
            }
            String json = extractOutputText(body);
            if (json == null) {
                log.warn("OpenAI 응답에서 출력 텍스트를 찾지 못했습니다. body={}", body);
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(json, LlmSummary.class));

        } catch (RestClientException e) {
            // 401(키 오류) · 429(레이트리밋) · 5xx 모두 여기로 온다.
            log.warn("OpenAI 요약 실패 - repo={}, 원인={}", repoFullName, e.getMessage());
            return Optional.empty();
        } catch (Exception e) {
            log.warn("OpenAI 응답 파싱 실패 - repo={}", repoFullName, e);
            return Optional.empty();
        } finally {
            // 어느 경로로 빠져나가든 반드시 반납한다. 한 번이라도 새면 그만큼 한도가
            // 영구히 줄어들고, 결국 모든 요약이 "한도 초과"로 떨어진다.
            inFlight.release();
        }
    }

    private Map<String, Object> requestBody(String userPrompt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", List.of(
                Map.of("role", "system", "content", SYSTEM_PROMPT),
                Map.of("role", "user", "content", userPrompt)));
        // Chat Completions는 Responses API와 감싸는 키가 다르다.
        //   Responses      : text.format = { type, name, strict, schema }
        //   ChatCompletions: response_format = { type, json_schema: { name, strict, schema } }
        // 한 겹 더 들어간다는 점만 다르고 스키마 내용은 같다.
        body.put("response_format", Map.of(
                "type", "json_schema",
                "json_schema", Map.of(
                        "name", SCHEMA_NAME,
                        "strict", true,
                        "schema", schema())));
        return body;
    }

    /**
     * 응답 스키마.
     *
     * <p>{@code strict: true} 를 쓰려면 모든 속성이 {@code required} 에 있어야 하고
     * {@code additionalProperties: false} 여야 한다. 그래서 "선택 항목"이라는 개념이 없다 —
     * 근거가 없으면 빈 문자열·빈 배열로 채우라고 프롬프트에서 지시한 이유다.
     */
    private static Map<String, Object> schema() {
        Map<String, Object> stringArray = Map.of("type", "array", "items", Map.of("type", "string"));
        Map<String, Object> properties = new LinkedHashMap<>();
        // 순서가 곧 생성 순서다. 모델은 앞서 낸 출력을 참고해 뒤를 쓰므로,
        // highlights를 맨 끝에 둬야 "앞 항목에 쓴 말을 반복하지 마라"는 지시가 실제로 먹는다.
        properties.put("one_liner", Map.of("type", "string"));
        properties.put("purpose", Map.of("type", "string"));
        properties.put("key_features", stringArray);
        properties.put("tech_stacks", stringArray);
        properties.put("highlights", stringArray);

        return Map.of(
                "type", "object",
                "properties", properties,
                "required", List.of("one_liner", "purpose", "key_features", "tech_stacks", "highlights"),
                "additionalProperties", false);
    }

    /**
     * Chat Completions 응답에서 모델이 만든 JSON 문자열을 꺼낸다.
     * ({@code choices[0].message.content})
     *
     * <p><b>{@code refusal}을 먼저 본다.</b> 모델이 요청을 거부하면 {@code content}가 null이고
     * 거부 사유가 {@code refusal}에 담긴다. 이걸 안 보면 "응답이 비었다"로만 보여서
     * 원인을 찾을 수 없다.
     */
    private static String extractOutputText(JsonNode body) {
        JsonNode message = body.path("choices").path(0).path("message");

        if (message.hasNonNull("refusal")) {
            log.warn("OpenAI가 요청을 거부했습니다: {}", message.get("refusal").asText());
            return null;
        }
        return message.hasNonNull("content") ? message.get("content").asText() : null;
    }

    /**
     * 모델이 돌려준 요약. JSON 키가 snake_case인데 이 프로젝트의 Jackson 전역 설정
     * ({@code property-naming-strategy: SNAKE_CASE})과 마침 일치해서 별도 애너테이션이 필요 없다.
     */
    public record LlmSummary(
            String oneLiner,
            String purpose,
            List<String> keyFeatures,
            List<String> techStacks,
            List<String> highlights) {

        /** null 방어. strict 스키마라 빠질 일은 없지만, 모델 응답을 그대로 믿지 않는다. */
        public List<String> safeKeyFeatures() {
            return keyFeatures == null ? new ArrayList<>() : keyFeatures;
        }

        public List<String> safeTechStacks() {
            return techStacks == null ? new ArrayList<>() : techStacks;
        }

        public List<String> safeHighlights() {
            return highlights == null ? new ArrayList<>() : highlights;
        }
    }
}

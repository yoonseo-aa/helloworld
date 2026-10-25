package com.helloworld.domain.post.summary.service;

import com.helloworld.domain.post.summary.client.GithubRepoClient;
import com.helloworld.domain.post.summary.client.GithubRepoClient.RepoRef;
import com.helloworld.domain.post.summary.client.OpenAiClient;
import com.helloworld.domain.post.summary.client.OpenAiClient.LlmSummary;
import com.helloworld.domain.post.summary.dto.request.RepoSummaryRequest;
import com.helloworld.domain.post.summary.dto.response.AnalyzeProjectResponse;
import com.helloworld.domain.post.summary.dto.response.GithubRepoResponse;
import com.helloworld.domain.post.summary.entity.RepoSummary;
import com.helloworld.domain.post.summary.support.RepoSummaryCache;
import com.helloworld.domain.post.entity.Post;
import com.helloworld.domain.post.mapper.PostMapper;
import com.helloworld.domain.user.service.UserService;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 작성 폼의 GitHub 저장소 선택을 뒷받침한다. (목록 조회 · 저장소 분석)
 *
 * <p><b>흐름</b>
 * <pre>
 *  저장소 선택 목록 열기 → listRepos()   프로필의 github_username 으로 공개 저장소
 *  저장소 하나 고르기   → analyze()     README·언어 조회 + AI 요약 생성 + 캐시 저장
 *  게시물 저장          → findCached()  캐시에 넣어둔 요약을 꺼내 posts.ai_summary 에 기록
 * </pre>
 *
 * <p><b>왜 동기인가</b> — 예전에는 게시물 저장 뒤 비동기로 요약을 만들었는데, 그러면 요약이
 * 몇 초 늦게 도착해서 화면에 "만드는 중 / 없음 / 실패"라는 상태를 따로 표시해야 했다.
 * 저장소를 고르는 시점은 사용자가 <b>이미 무언가를 기다리는 자리</b>라 스피너가 자연스럽고,
 * 상태 관리·재시도·전용 스레드 풀이 전부 필요 없어진다.
 *
 * <p><b>README가 없으면 요약을 만들지 않는다.</b> 언어 통계만으로 만들면 한 줄 소개도
 * 기능 설명도 없이 언어 목록만 덩그러니 남는다. 그건 요약이라기보다 빈 껍데기다.
 * 다만 {@code techStacks} 는 그대로 내려준다 — 태그 자동 입력에는 언어만으로도 쓸모가 있다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PostSummaryService {

    /**
     * 이 길이(공백 제외) 미만이면 README가 없는 것으로 취급한다.
     *
     * <p>{@code # 프로젝트명} 한 줄만 있는 저장소가 흔하다. 그런 README를 LLM에 보내면
     * 토큰만 쓰고 결과는 저장소 이름을 되풀이하는 수준이다.
     */
    private static final int MIN_README_LENGTH = 200;

    /**
     * 기술스택에 넣을 언어 개수 상한.
     *
     * <p>저장소에는 설정 파일 때문에 잡히는 언어(Dockerfile, Batchfile, Shell 등)가 섞여 있다.
     * 바이트 내림차순으로 잘라내면 그런 것들이 자연히 뒤로 밀린다.
     */
    private static final int MAX_LANGUAGES = 5;

    /** 저장소 목록 상한. 화면에서 스크롤로 고르는 용도라 이 정도면 충분하다. */
    private static final int MAX_REPOS = 50;

    /**
     * 기술스택 태그 상한.
     *
     * <p>프롬프트에서도 8개로 제한하지만 모델 응답을 그대로 믿지 않는다. 여기에 언어 5개가
     * 먼저 들어가므로, 모델이 상한을 어기면 태그가 열 개 넘게 나와 패널 한 칸을 다 먹는다.
     */
    private static final int MAX_TECH_STACKS = 8;

    private final GithubRepoClient githubRepoClient;
    private final OpenAiClient openAiClient;
    private final RepoSummaryCache cache;
    private final UserService userService;
    private final PostMapper postMapper;

    /**
     * 저장소 분석 — 기술스택 + AI 요약.
     *
     * <p><b>README 원문은 돌려주지 않는다.</b> 요약 패널이 프로젝트 설명을 이미 담고 있어서,
     * 본문까지 자동으로 채우면 한 화면에서 같은 이야기를 두 번 읽게 된다.
     * README는 요약을 만드는 <b>재료</b>로만 쓰고, 본문은 작성자 몫으로 비워 둔다.
     *
     * <p>만들어진 요약은 캐시에 넣어둔다. 게시물을 저장할 때 원본과 비교해
     * "사용자가 고쳤는지"를 판단하는 데 쓴다.
     *
     * <p><b>실패해도 예외를 던지지 않는다.</b> 저장소를 못 읽는 것은 오류가 아니라
     * "직접 입력하세요" 상태다. 빈 값으로 응답하고 화면이 알아서 처리한다.
     */
    public AnalyzeProjectResponse analyze(Long userId, String githubUrl) {
        Optional<RepoRef> parsed = GithubRepoClient.parseRepoRef(githubUrl);
        if (parsed.isEmpty()) {
            log.info("저장소 분석 - GitHub 주소로 읽을 수 없습니다. url={}", githubUrl);
            return empty();
        }
        RepoRef ref = parsed.get();

        String readme = githubRepoClient.fetchReadme(ref).orElse("");
        List<String> languages = topLanguages(githubRepoClient.fetchLanguages(ref));

        int length = readme.replaceAll("\\s", "").length();
        if (length < MIN_README_LENGTH) {
            // README를 못 읽은 것과 너무 짧은 것을 굳이 나누지 않는다 — 결론이 같다.
            // 다만 길이를 남겨야 "왜 요약이 안 나왔는지"를 사람이 판단할 수 있다.
            log.info("저장소 분석 - README가 부족해 요약을 만들지 않습니다. repo={}, 공백 제외 {}자",
                    ref.fullName(), length);
            return AnalyzeProjectResponse.builder().techStacks(languages).build();
        }

        Optional<LlmSummary> generated = openAiClient.summarize(ref.fullName(), readme, languages);

        RepoSummary summary = generated
                .map(s -> new RepoSummary(
                        s.oneLiner(),
                        s.purpose(),
                        s.safeKeyFeatures(),
                        s.safeHighlights(),
                        false,   // 방금 만들었으니 아직 아무도 손대지 않았다
                        LocalDateTime.now(),
                        openAiClient.getModel()))
                .orElse(null);

        if (summary != null) {
            // 저장 시점에 "사용자가 고쳤는지" 판단하려면 원본이 있어야 한다.
            cache.put(userId, ref.fullName(), summary);
        }

        // 태그는 요약 바깥에 둔다. 게시물의 tech_stacks 로 따로 저장·표시되므로
        // 요약 안에 또 넣으면 같은 목록이 한 화면에 두 번 나온다.
        // 요약을 못 만들었으면 언어만 — 언어는 LLM 없이도 확실한 값이다.
        List<String> techStacks = generated
                .map(s -> mergeTechStacks(languages, s.safeTechStacks()))
                .orElse(languages);

        log.info("저장소 분석 완료 - repo={}, README {}자, 태그 {}개, 요약={}",
                ref.fullName(), readme.length(), techStacks.size(),
                summary == null ? "없음" : "생성");

        // 구조화 요약은 캐시에만 남기고 응답에는 싣지 않는다 — 화면이 읽는 것은 readme 뿐이고,
        // 저장은 서버가 캐시에서 직접 꺼내 처리한다.
        return AnalyzeProjectResponse.builder()
                .techStacks(techStacks)
                .readme(renderDraft(summary))
                .build();
    }

    /**
     * 저장된 AI 요약을 돌려준다. (POST /api/posts/{postId}/ai-summary)
     *
     * <p><b>여기서는 LLM을 부르지 않는다.</b> 요약은 게시물을 작성할 때 저장소를 고르는 시점에
     * {@link #analyze}가 만들어 {@code posts.ai_summary}에 함께 저장한다. 조회는 그 값을 읽기만 한다.
     *
     * <p>조회 시점에 생성까지 하도록 열어두면 비용이 통제되지 않는다. 게시물 하나당 한 번이라
     * 상한이 있는 것처럼 보이지만, 요약이 없는 게시물이 수천 건 쌓여 있으면 그 전부가 호출 대상이다.
     * 스크립트로 훑으면 크레딧이 한 번에 소진되고, 공격이 아니어도 <b>사용자가 옛 글을 열어보기만 해도</b>
     * 호출이 걸린다. 생성 지점을 작성 시점 하나로 묶어두면 이 문제가 아예 생기지 않는다.
     *
     * <p>부수 효과로 동시성 문제도 사라진다 — 쓰기가 없으니 두 요청이 겹쳐도 경합할 대상이 없다.
     *
     * <p>요약이 없으면 <b>빈 문자열</b>이다. 오류가 아니라 "만들 재료가 없었던" 정상적인 상태다
     * (GitHub 미연결, README 부족, 생성 실패). 화면은 요약 영역을 그리지 않는다.
     *
     * @return 마크다운 요약. 없으면 빈 문자열
     */
    public String getSummary(Long postId) {
        Post post = postMapper.selectById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.POST_NOT_FOUND));

        return StringUtils.hasText(post.getAiSummary()) ? post.getAiSummary() : "";
    }

    /**
     * 요약을 본문 초안(마크다운)으로 조립한다.
     *
     * <p>작성 폼이 이 값을 본문 입력칸에 그대로 넣는다. 요약을 못 만들었으면 <b>빈 문자열</b>을
     * 돌려준다 — 프론트가 상태에 그대로 대입하므로 null이 가면 화면이 깨진다.
     *
     * <p>근거가 없는 항목은 통째로 건너뛴다. 프롬프트가 "근거가 부족하면 비워 둔다"고
     * 지시하므로 빈 값이 정상적으로 올라오는데, 제목만 남기면 사용자가 지워야 할 껍데기가 된다.
     *
     * <p>기술 스택은 넣지 않는다 — 태그 입력칸에 이미 들어간다.
     */
    private static String renderDraft(RepoSummary summary) {
        if (summary == null) {
            return "";
        }

        StringBuilder draft = new StringBuilder();
        appendParagraph(draft, "한 줄 소개", summary.oneLiner());
        appendParagraph(draft, "프로젝트 목적", summary.purpose());
        appendList(draft, "핵심 기능", summary.keyFeatures());
        appendList(draft, "프로젝트 특징", summary.highlights());

        return draft.toString().strip();
    }

    private static void appendParagraph(StringBuilder draft, String heading, String body) {
        if (!StringUtils.hasText(body)) {
            return;
        }
        draft.append("## ").append(heading).append("\n")
                .append(body.strip()).append("\n\n");
    }

    private static void appendList(StringBuilder draft, String heading, List<String> items) {
        if (items == null || items.isEmpty()) {
            return;
        }
        draft.append("## ").append(heading).append("\n");
        for (String item : items) {
            if (!StringUtils.hasText(item)) continue;
            draft.append("- ").append(item.strip()).append("\n");
        }
        draft.append("\n");
    }

    /**
     * 게시물 저장 시점에 {@code posts.ai_summary} 에 넣을 요약을 확정한다.
     *
     * <p><b>사용자가 고친 값이 정본이다.</b> 저장소를 고르면 요약이 화면에 뜨고, 사용자는
     * 그 자리에서 문구를 고친 뒤 게시한다. 그래서 프론트가 보낸 값을 그대로 쓴다.
     *
     * <p>다만 세 가지는 서버가 정한다.
     * <ul>
     *   <li>{@code generatedAt}·{@code model} — 출처 정보다. 사용자 입력을 받으면
     *       "언제 무엇으로 만든 요약인가"에 답할 수 없게 된다. 캐시의 원본에서 가져온다.</li>
     *   <li>{@code edited} — 원본과 직접 비교해서 정한다. 프론트가 보내는 플래그를 믿으면,
     *       고치지 않고 그대로 보낸 경우까지 "수정함"으로 표시될 수 있다.</li>
     * </ul>
     *
     * <p><b>캐시가 만료됐으면 {@code edited = true} 로 본다.</b> 비교할 원본이 없으니
     * 고쳤는지 알 수 없는데, 이때 "AI가 만들었습니다"라고 붙이는 쪽이 더 나쁜 오류다.
     *
     * @param submitted 프론트가 보낸 요약. {@code null}이면 서버가 만든 원본을 그대로 저장한다
     *                  (요약 패널을 아직 붙이지 않은 화면 대응).
     * @return 저장할 요약. 비어 있으면 {@code ai_summary} 를 {@code null} 로 둔다.
     */
    public Optional<RepoSummary> resolveForSave(Long userId, String githubUrl,
                                                RepoSummaryRequest submitted) {
        if (!StringUtils.hasText(githubUrl)) {
            return Optional.empty();   // GitHub 주소가 없는 게시물(카드뉴스 등)
        }

        Optional<RepoSummary> original = findCached(userId, githubUrl);

        if (submitted == null) {
            return original;
        }
        if (submitted.isBlank()) {
            // 사용자가 모든 칸을 비웠다 = 요약을 빼겠다는 뜻. 빈 껍데기를 저장하지 않는다.
            log.info("요약 저장 - 내용이 비어 있어 저장하지 않습니다. userId={}, url={}", userId, githubUrl);
            return Optional.empty();
        }

        boolean edited = original.map(submitted::differsFrom).orElse(true);

        return Optional.of(new RepoSummary(
                submitted.getOneLiner(),
                submitted.getPurpose(),
                submitted.safeKeyFeatures(),
                submitted.safeHighlights(),
                edited,
                original.map(RepoSummary::generatedAt).orElseGet(LocalDateTime::now),
                original.map(RepoSummary::model).orElseGet(openAiClient::getModel)));
    }

    /**
     * 작성 폼의 저장소 선택 목록.
     *
     * <p>프로필에 등록된 GitHub 사용자명으로 <b>공개 저장소</b>를 조회한다.
     * 사용자별 OAuth 토큰이 없어도 되는 대신 비공개 저장소는 나오지 않는데,
     * 요약도 공개 저장소만 만들 수 있으므로 목록과 결과가 어긋나지 않는다.
     *
     * @return GitHub 사용자명을 등록하지 않았거나 조회에 실패하면 빈 목록.
     *         오류가 아니라 <b>정상적인 상태</b>다 — 화면은 "연동된 저장소가 없습니다"를 보여준다.
     */
    public List<GithubRepoResponse> listRepos(Long userId) {
        Optional<String> username = userService.findGithubUsername(userId);
        if (username.isEmpty()) {
            log.info("저장소 목록 - GitHub 사용자명이 등록되지 않았습니다. userId={}", userId);
            return List.of();
        }
        return githubRepoClient.fetchUserRepos(username.get(), MAX_REPOS).stream()
                .map(r -> GithubRepoResponse.builder()
                        .repoId((Long) r.get("id"))
                        .name((String) r.get("name"))
                        .fullName((String) r.get("fullName"))
                        .htmlUrl((String) r.get("htmlUrl"))
                        .description((String) r.get("description"))
                        .language((String) r.get("language"))
                        .updatedAt((String) r.get("pushedAt"))
                        .build())
                .toList();
    }

    /**
     * 게시물 저장 시점에 쓸 요약을 캐시에서 꺼낸다.
     *
     * <p>여기서 <b>다시 만들지 않는다.</b> 만들면 게시물 작성이 5~15초 멈추고 비용도
     * 한 번 더 든다. 캐시가 만료됐다면 요약 없이 저장하는 편이 낫다 — 요약은
     * 게시물의 부가 정보다.
     *
     * @return 분석을 거치지 않았거나 TTL이 지났으면 비어 있음
     */
    public Optional<RepoSummary> findCached(Long userId, String githubUrl) {
        return GithubRepoClient.parseRepoRef(githubUrl)
                .flatMap(ref -> cache.get(userId, ref.fullName()));
    }

    private static AnalyzeProjectResponse empty() {
        return AnalyzeProjectResponse.builder().techStacks(List.of()).build();
    }

    /**
     * 언어별 바이트 → 코드량이 많은 순 언어명.
     *
     * <p>비율을 계산하지 않는 이유: 화면의 {@code tech_stacks}는 <b>이름 목록</b>이라
     * 퍼센트가 나가지 않는다.
     */
    private static List<String> topLanguages(Map<String, Long> languageBytes) {
        return languageBytes.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(MAX_LANGUAGES)
                .toList();
    }

    /**
     * 확인된 언어를 앞에 두고, 모델이 찾아낸 라이브러리를 뒤에 붙인다.
     *
     * <p>언어가 먼저인 이유는 그쪽이 <b>실제 코드에서 집계된 사실</b>이기 때문이다.
     * 모델이 같은 언어를 다시 언급하면 중복되므로 {@link LinkedHashSet}으로 걸러낸다.
     */
    private static List<String> mergeTechStacks(List<String> languages, List<String> fromLlm) {
        LinkedHashSet<String> merged = new LinkedHashSet<>(languages);
        merged.addAll(fromLlm);
        return merged.stream().limit(MAX_TECH_STACKS).toList();
    }
}

package com.helloworld.domain.post.summary.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.helloworld.domain.post.summary.entity.RepoSummary;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Objects;

/**
 * 게시물 작성 요청에 실려 오는 프로젝트 요약 ({@code POST /api/posts} 의 {@code summary}).
 *
 * <p>저장소를 고르면 서버가 요약을 만들어 화면에 보여주고, <b>사용자가 그 자리에서 고친다.</b>
 * 그래서 저장 시점에는 프론트가 들고 있는 값이 정본이다.
 *
 * <p><b>{@link RepoSummary}를 그대로 받지 않는 이유</b>
 * <ul>
 *   <li>{@code generatedAt}·{@code model}·{@code edited} 는 <b>출처 정보</b>다.
 *       사용자 입력을 받으면 "AI가 언제 무엇으로 만들었나"라는 질문에 답할 수 없게 된다.
 *       서버가 캐시에 있는 원본을 보고 직접 채운다.</li>
 *   <li>길이 제한이 필요하다. 안 막으면 요약 패널이 두 번째 본문이 된다.</li>
 * </ul>
 *
 * <p>기술 스택은 여기 없다. 게시물의 {@code tech_stacks}로 이미 따로 저장·표시된다.
 */
@Getter
@Setter
@NoArgsConstructor
public class RepoSummaryRequest {

    /** 화면 한 줄에 들어가야 한다. 모델에게는 100자로 지시하고, 사람 손을 감안해 여유를 둔다. */
    @Size(max = 150, message = "한 줄 소개는 150자를 넘을 수 없습니다.")
    private String oneLiner;

    @Size(max = 400, message = "주요 목적은 400자를 넘을 수 없습니다.")
    private String purpose;

    /**
     * 핵심 기능. 체크 목록으로 그려지므로 개수와 길이를 함께 막는다.
     *
     * <p>{@code List<@Size String>} 형태는 원소 하나하나에 제약이 걸린다
     * (Bean Validation의 컨테이너 원소 제약). 리스트 자체의 개수 제한은 바깥 {@code @Size}다.
     */
    @Size(max = 8, message = "핵심 기능은 8개를 넘을 수 없습니다.")
    private List<@Size(max = 80, message = "핵심 기능은 항목당 80자를 넘을 수 없습니다.") String> keyFeatures;

    @Size(max = 8, message = "프로젝트 특징은 8개를 넘을 수 없습니다.")
    private List<@Size(max = 60, message = "프로젝트 특징은 항목당 60자를 넘을 수 없습니다.") String> highlights;

    /**
     * 내용이 하나도 없으면 "요약을 지웠다"로 본다.
     *
     * <p>사용자가 모든 칸을 비웠는데 빈 껍데기를 저장하면, 화면에는 제목만 있고 안은 텅 빈
     * 요약 패널이 뜬다. 그럴 바에는 요약이 없는 게 낫다.
     */
    @JsonIgnore
    public boolean isBlank() {
        return !StringUtils.hasText(oneLiner)
                && !StringUtils.hasText(purpose)
                && isEmpty(keyFeatures)
                && isEmpty(highlights);
    }

    /** null 대신 빈 목록. 응답 JSON에 {@code null} 배열이 나가지 않게 한다. */
    public List<String> safeKeyFeatures() {
        return keyFeatures == null ? List.of() : keyFeatures;
    }

    public List<String> safeHighlights() {
        return highlights == null ? List.of() : highlights;
    }

    /**
     * 서버가 만든 원본과 내용이 다른가.
     *
     * <p>이걸로 {@code edited} 를 정한다. 프론트가 보내주는 플래그를 믿지 않는 이유는,
     * 고치지 않고 그대로 보낸 경우까지 "수정함"으로 표시될 수 있어서다.
     * 서버가 원본을 들고 있으니 직접 비교하면 된다.
     */
    public boolean differsFrom(RepoSummary original) {
        return !Objects.equals(oneLiner, original.oneLiner())
                || !Objects.equals(purpose, original.purpose())
                || !Objects.equals(safeKeyFeatures(), original.keyFeatures())
                || !Objects.equals(safeHighlights(), original.highlights());
    }

    private static boolean isEmpty(List<String> values) {
        return values == null || values.stream().noneMatch(StringUtils::hasText);
    }
}

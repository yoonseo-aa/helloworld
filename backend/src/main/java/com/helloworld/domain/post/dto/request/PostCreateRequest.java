package com.helloworld.domain.post.dto.request;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.helloworld.domain.post.summary.dto.request.RepoSummaryRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 게시물 생성 요청. 검증은 @Valid로 Controller에서 트리거.
 * JSON은 snake_case로 들어온다(post_type, thumbnail_url ...). Jackson 전역 설정으로 매핑.
 *
 * 필드 매핑(요청 → DB):
 *  - deploy_url → posts.project_link
 *  - summary    → posts.ai_summary (JSON 직렬화)
 *  - tech_stacks → tags + post_tags
 *  - image_urls  → post_medias(media_type=IMAGE)
 */
@Getter
public class PostCreateRequest {

    /**
     * 게시물 유형 값. <b>허용 목록 검사와 유형별 분기가 같은 상수를 쓰도록</b> 뽑아 둔다.
     *
     * <p>리터럴을 두 곳에 쓰면(허용 패턴 + 아래 교차 검증) 한쪽만 오타가 나도 컴파일은 통과하고
     * <b>검증이 조용히 무력화된다</b> — 예를 들어 분기 쪽이 "CARDNEWS"면 카드뉴스 요청이
     * 항상 통과해 이미지 0장 게시물이 만들어진다. 같은 상수를 참조하면 그 어긋남 자체가 불가능하다.
     *
     * <p>{@code static final String} 리터럴은 컴파일 타임 상수라 애너테이션 값으로도 쓸 수 있다.
     *
     * <p>(enum이 더 적절해 보이지만, 유형은 DTO·엔티티·DB에서 모두 문자열로 다루고 있어
     * enum 도입은 게시물 조회 브랜치와 함께 정리하는 편이 낫다 — 지금 바꾸면 그쪽과 충돌한다)
     */
    public static final String TYPE_PROJECT = "PROJECT";
    public static final String TYPE_CARD_NEWS = "CARD_NEWS";

    @NotBlank(message = "게시물 유형은 필수입니다.")
    @Pattern(regexp = TYPE_PROJECT + "|" + TYPE_CARD_NEWS,
            message = "게시물 유형은 PROJECT 또는 CARD_NEWS만 가능합니다.")
    private String postType;

    @NotBlank(message = "내용은 필수입니다.")
    private String content;

    private String thumbnailUrl;     // 프로젝트 썸네일 (선택)
    private String githubUrl;        // GitHub Repository URL (선택)
    private String deployUrl;        // 배포 URL → project_link (선택)

    private List<String> techStacks; // 기술 스택 (선택)

    /**
     * 프로젝트 요약 (선택).
     *
     * <p>저장소를 고르면 서버가 만들어 화면에 보여주고, <b>사용자가 고친 뒤</b> 게시물과 함께
     * 돌아온다. 그래서 요청으로 받는다.
     *
     * <p>보내지 않으면 서버가 분석 때 캐시에 넣어둔 원본을 꺼내 저장한다. 요약 패널을
     * 아직 붙이지 않은 화면이나, 저장소를 고르지 않은 게시물이 여기 해당한다.
     *
     * <p>{@code generatedAt}·{@code model}·{@code edited} 는 여기 없다 — 출처 정보라
     * 서버가 채운다. {@link com.helloworld.domain.post.summary.dto.request.RepoSummaryRequest} 참고.
     *
     * <p>{@code @Valid} 가 있어야 중첩 객체 안쪽 제약(@Size 등)까지 검사된다.
     * 없으면 이 필드의 존재만 확인하고 내용은 그냥 통과한다.
     */
    @Valid
    private RepoSummaryRequest summary;

    /**
     * 카드뉴스 이미지 목록. <b>CARD_NEWS는 1장 이상 필수</b>, PROJECT는 쓰지 않는다.
     * (팀 확정: 카드뉴스는 1장이어도 되고 여러 장이어도 된다)
     */
    private List<String> imageUrls;

    /**
     * 유형별 필수값 교차 검증 — 카드뉴스는 이미지가 최소 1장 있어야 한다.
     *
     * <p>필드 하나만으로는 판단할 수 없어(다른 필드 값에 따라 필수 여부가 바뀜)
     * {@code @NotEmpty} 대신 {@code @AssertTrue}로 검증한다. 실패하면 다른 검증과 똑같이
     * {@code MethodArgumentNotValidException} → 400 {@code COMMON_INVALID_PARAM}으로 나간다.
     *
     * <p>이 검증이 없으면 <b>이미지 0장인 카드뉴스</b>가 만들어진다. 그러면 목록·그리드에서
     * 대표컷이 없는 빈 타일로 보이고, 사용자는 왜 비어 있는지 알 수 없다.
     * 빈 문자열만 담긴 경우도 이미지가 없는 것과 같으므로 함께 거른다.
     *
     * <p><b>{@code StringUtils.hasText}를 쓰는 이유</b>: 저장 쪽({@code PostService.saveImages})도
     * 같은 판정으로 이미지를 걸러낸다. 두 곳이 <b>같은 술어</b>를 쓰므로
     * "검증은 통과했는데 저장할 게 없다"가 성립할 수 없다 —
     * 검증 통과 ⟺ {@code hasText}인 원소가 1개 이상 ⟺ 저장되는 행이 1개 이상.
     * 한쪽만 {@code trim} 여부를 바꾸면 그 대응이 깨지므로 함께 고쳐야 한다.
     *
     * <p>{@code @JsonIgnore}: 이 메서드는 검증용이고 요청/응답 본문의 필드가 아니다.
     * 붙이지 않으면 Jackson이 {@code card_news_image_valid}라는 프로퍼티로 오해할 수 있다.
     */
    @JsonIgnore
    @AssertTrue(message = "카드뉴스는 이미지가 1장 이상 필요합니다.")
    public boolean isCardNewsImageValid() {
        if (!TYPE_CARD_NEWS.equals(postType)) {
            return true;
        }
        return imageUrls != null && imageUrls.stream().anyMatch(StringUtils::hasText);
    }
}

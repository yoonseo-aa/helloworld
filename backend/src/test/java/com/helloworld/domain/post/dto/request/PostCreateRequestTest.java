package com.helloworld.domain.post.dto.request;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 게시물 생성 요청의 유형별 필수값 검증.
 *
 * <p>왜 단위 테스트로 두는가: 카드뉴스 이미지 검증은 문자열 비교로 유형을 판단한다.
 * 그 문자열이 어긋나면(예: 상수를 안 쓰고 "CARDNEWS"로 오타) <b>컴파일은 통과하고 검증만
 * 조용히 무력화된다</b> — 카드뉴스 요청이 전부 통과해 이미지 0장 게시물이 만들어진다.
 * 서버를 띄우지 않고도 그 회귀를 잡을 수 있어야 한다.
 */
class PostCreateRequestTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    /**
     * 요청 DTO는 Jackson이 역직렬화로 채우므로 setter가 없다.
     * 테스트에서는 리플렉션으로 값을 넣는다(프로덕션 코드에 테스트용 setter를 만들지 않기 위해).
     */
    private PostCreateRequest request(String postType, String content, List<String> imageUrls) {
        try {
            PostCreateRequest r = new PostCreateRequest();
            set(r, "postType", postType);
            set(r, "content", content);
            set(r, "imageUrls", imageUrls);
            return r;
        } catch (Exception e) {
            throw new IllegalStateException("테스트 요청 객체 생성 실패", e);
        }
    }

    private void set(Object target, String fieldName, Object value) throws Exception {
        Field field = PostCreateRequest.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private Set<ConstraintViolation<PostCreateRequest>> validate(PostCreateRequest r) {
        return validator.validate(r);
    }

    private boolean hasImageViolation(Set<ConstraintViolation<PostCreateRequest>> violations) {
        return violations.stream()
                .anyMatch(v -> v.getMessage().contains("이미지가 1장 이상"));
    }

    @Test
    @DisplayName("카드뉴스 + 이미지 목록 자체가 없으면 거부한다")
    void cardNews_withoutImageUrls_isRejected() {
        Set<ConstraintViolation<PostCreateRequest>> violations =
                validate(request(PostCreateRequest.TYPE_CARD_NEWS, "내용", null));

        assertThat(hasImageViolation(violations)).isTrue();
    }

    @Test
    @DisplayName("카드뉴스 + 빈 배열이면 거부한다")
    void cardNews_withEmptyList_isRejected() {
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_CARD_NEWS, "내용", List.of())))).isTrue();
    }

    @Test
    @DisplayName("카드뉴스 + 공백 문자열만 있으면 거부한다 (저장 쪽이 걸러내는 값과 같은 판정)")
    void cardNews_withBlankStringsOnly_isRejected() {
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_CARD_NEWS, "내용", List.of("", "   "))))).isTrue();
    }

    @Test
    @DisplayName("카드뉴스 + 유효한 이미지 1장이면 통과한다 (1장도 허용)")
    void cardNews_withSingleImage_passes() {
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_CARD_NEWS, "내용",
                        List.of("https://example.com/a.png"))))).isFalse();
    }

    @Test
    @DisplayName("카드뉴스 + 공백이 섞여 있어도 유효한 값이 하나 있으면 통과한다")
    void cardNews_withBlankMixedIn_passes() {
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_CARD_NEWS, "내용",
                        List.of("   ", "https://example.com/a.png"))))).isFalse();
    }

    @Test
    @DisplayName("프로젝트는 이미지가 없어도 통과한다 (null·빈 배열 모두)")
    void project_withoutImages_passes() {
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_PROJECT, "내용", null)))).isFalse();
        assertThat(hasImageViolation(validate(
                request(PostCreateRequest.TYPE_PROJECT, "내용", List.of())))).isFalse();
    }

    @Test
    @DisplayName("허용되지 않는 유형은 패턴 검증에서 거부된다")
    void unknownType_isRejected() {
        Set<ConstraintViolation<PostCreateRequest>> violations =
                validate(request("BANANA", "내용", null));

        assertThat(violations).anyMatch(v -> v.getMessage().contains("PROJECT 또는 CARD_NEWS"));
    }
}

package com.helloworld.domain.post.summary.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * 저장소 분석 요청 (POST /api/posts/analyze).
 *
 * <p>JSON은 프로젝트 규약대로 snake_case로 들어온다({@code github_url}).
 * 프론트의 {@code AnalyzeProjectRequest} 타입과 같은 형태다.
 */
@Getter
@Setter
@NoArgsConstructor
public class AnalyzeProjectRequest {

    /**
     * GitHub 저장소 주소.
     *
     * <p>형식 검증은 여기서 하지 않는다. {@code https://github.com/{owner}/{repo}} 를
     * 정규식으로 막으면 {@code .git} 접미사나 하위 경로가 붙은 흔한 형태까지 걸러버린다.
     * 파싱은 클라이언트가 관대하게 처리하고, 읽을 수 없으면 빈 결과로 흘려보낸다.
     */
    @NotBlank(message = "GitHub 저장소 주소는 필수입니다.")
    private String githubUrl;
}

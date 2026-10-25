package com.helloworld.domain.post.summary.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 작성 폼의 저장소 선택 목록 (GET /api/github/repos).
 *
 * <p>JSON은 프로젝트 규약대로 snake_case로 나간다
 * ({@code repo_id / full_name / html_url / updated_at}).
 */
@Getter
@Builder
public class GithubRepoResponse {

    /** GitHub 저장소 id. 화면에서 목록 key로 쓴다. */
    private Long repoId;

    private String name;

    /** {@code owner/repo}. 같은 이름의 저장소를 구분할 때 필요하다. */
    private String fullName;

    /** 저장소 주소. 이 값을 그대로 요약 미리보기와 게시물의 github_url 에 쓴다. */
    private String htmlUrl;

    private String description;

    /** GitHub이 판정한 대표 언어. 없을 수 있다(빈 저장소·설정 파일만 있는 경우). */
    private String language;

    /** 마지막 푸시 시각. 목록이 이 순서로 내려온다. */
    private String updatedAt;

    /** 목록 응답 봉투. 배열을 그대로 내리지 않는 것은 나중에 페이징을 붙일 자리를 남겨두기 위해서다. */
    @Getter
    @Builder
    public static class ListResponse {
        private List<GithubRepoResponse> repos;
    }
}

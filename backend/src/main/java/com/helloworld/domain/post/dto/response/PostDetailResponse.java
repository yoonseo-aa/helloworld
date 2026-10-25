package com.helloworld.domain.post.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 게시물 상세 조회 응답 (GET /api/posts/{postId}).
 *
 * <p>매핑 출처가 여럿이라 조회 후 Service가 조합한다:
 * <ul>
 *   <li>posts+users 조인(resultMap): post_id/post_type/content/썸네일/github/deploy/summary/comment_count/view_count/author</li>
 *   <li>tech_stacks : post_tags→tags 조회로 채움</li>
 *   <li>image_urls : post_medias 조회로 채움</li>
 *   <li>like_count/is_liked : Redis 정본(post:like:*) 조회로 채움</li>
 *   <li>author.is_following : 팔로우 정본에서 채움</li>
 * </ul>
 * deploy_url=project_link, summary=ai_summary 로 매핑한다. 조회 시 view_count를 1 증가시킨다.
 */
@Getter
@Setter
@NoArgsConstructor
public class PostDetailResponse {

    private Long postId;
    private String postType;
    private PostAuthorResponse author;
    private String thumbnailUrl;
    private String content;
    private String githubUrl;
    private String deployUrl;

    /**
     * {@code posts.ai_summary} 원문. MyBatis가 채우고, Service가 {@link #summary}로 옮긴 뒤
     * 응답에서는 감춘다.
     *
     * <p>필드를 둘로 나눠 둔 이유는 매퍼 XML이 컬럼명 그대로 채우게 하기 위해서다.
     * 매퍼에 변환을 넣으면 "어디서 바뀌는지"가 흩어진다.
     */
    @JsonIgnore
    private String aiSummary;

    /**
     * 프로젝트 요약(마크다운). 없으면 키 자체가 빠진다(전역 {@code non_null} 직렬화).
     *
     * <p><b>가공하지 않고 컬럼 값을 그대로 내보낸다.</b> 렌더링은 프론트가 마크다운으로 처리한다.
     * 예전에는 여기서 JSON으로 파싱해 구조화 객체를 내려줬는데, 파싱에 실패하면 통째로
     * null이 되어 <b>저장된 요약이 있는데도 화면에 아무것도 안 뜨는</b> 상태가 됐다.
     *
     * <p>그래서 컬럼에는 세 종류의 값이 섞여 있을 수 있다 — 마크다운(현재), 형식 변경 이전의
     * JSON 문자열, 그보다 앞선 사용자 평문. 셋 다 문자열이라 그대로 나가고, 보여줄지 말지는
     * 화면이 판단한다. 서버가 형식을 검사해 걸러내면 "저장은 됐는데 안 보인다"가 다시 생긴다.
     */
    private String summary;

    private List<String> techStacks;
    private List<String> imageUrls;
    private Long likeCount;
    private Integer commentCount;
    private Integer viewCount;
    private Boolean isLiked;
    private LocalDateTime createdAt;

    /** 접근 제어용(비공개 글은 작성자만 열람) — 응답에는 노출하지 않는다. */
    @JsonIgnore
    private Boolean isPublic;
}

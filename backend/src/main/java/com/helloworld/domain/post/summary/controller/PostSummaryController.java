package com.helloworld.domain.post.summary.controller;

import com.helloworld.domain.post.summary.dto.request.AnalyzeProjectRequest;
import com.helloworld.domain.post.summary.dto.response.AiSummaryResponse;
import com.helloworld.domain.post.summary.dto.response.AnalyzeProjectResponse;
import com.helloworld.domain.post.summary.dto.response.GithubRepoResponse;
import com.helloworld.domain.post.summary.service.PostSummaryService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 게시물 작성 폼의 GitHub 저장소 선택 API.
 *
 * <pre>
 *  저장소 선택 버튼  →  GET  /api/github/repos    목록
 *  저장소 하나 클릭  →  POST /api/posts/analyze   README·태그·AI 요약
 * </pre>
 *
 * <p>두 경로 모두 <b>프론트가 이미 쓰고 있던 규약</b>을 그대로 따른다.
 * 백엔드에 구현이 없어 msw 목으로 돌던 것을 실제 응답으로 바꾼 것이다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class PostSummaryController {

    private final PostSummaryService postSummaryService;

    /**
     * 작성 폼의 저장소 선택 목록.
     *
     * <p>프로필에 등록한 GitHub 사용자명의 <b>공개 저장소</b>를 최근 푸시 순으로 돌려준다.
     * 포크는 제외한다 — 남의 코드를 자기 프로젝트로 올릴 일은 없다.
     *
     * <p>사용자명을 등록하지 않았으면 <b>빈 목록</b>이다. 오류가 아니라 정상적인 상태이고,
     * 화면은 "연동된 저장소가 없습니다"를 보여주면 된다.
     */
    @GetMapping("/api/github/repos")
    public ResponseEntity<ApiResponse<GithubRepoResponse.ListResponse>> listRepos(
            @LoginUserId Long userId) {

        List<GithubRepoResponse> repos = postSummaryService.listRepos(userId);
        log.info("저장소 목록 조회 - userId={}, {}건", userId, repos.size());

        return ResponseEntity.ok(ApiResponse.success(
                GithubRepoResponse.ListResponse.builder().repos(repos).build()));
    }

    /**
     * 저장소 분석 — 기술스택 + AI 요약을 한 번에 돌려준다.
     *
     * <p>프론트는 {@code tech_stacks} 로 태그 입력칸을 채우고, {@code summary} 로
     * 수정 가능한 요약 폼을 그린다.
     *
     * <p><b>README 원문은 돌려주지 않는다.</b> 요약 패널이 프로젝트 설명을 이미 담고 있어서,
     * 본문까지 자동으로 채우면 한 화면에서 같은 이야기를 두 번 읽게 된다.
     * 본문은 작성자 몫으로 비워 둔다.
     *
     * <p><b>응답이 5~15초 걸린다.</b> GitHub 왕복 2회 + LLM 호출이라 그렇다.
     * 프론트는 로딩 표시를 두어야 하고, 저장소를 연달아 바꿀 때 이전 요청을 취소해야 한다 —
     * <b>호출 한 번마다 과금된다.</b>
     *
     * <p>분석에 실패해도 <b>오류가 아니다.</b> README가 없는 저장소는 흔하고, 그때는
     * 요약만 빠진 채 200으로 응답한다. 404를 주면 프론트가 정상 상태를 오류로 다루게 된다.
     *
     * <p>생성된 요약은 서버가 캐시에 보관했다가 게시물 저장 시 직접 꺼내 쓴다.
     * 프론트가 들고 있다가 되돌려보낼 필요가 없다.
     */
    @PostMapping("/api/posts/analyze")
    public ResponseEntity<ApiResponse<AnalyzeProjectResponse>> analyze(
            @LoginUserId Long userId,
            @Valid @RequestBody AnalyzeProjectRequest request) {

        return ResponseEntity.ok(ApiResponse.success(
                postSummaryService.analyze(userId, request.getGithubUrl())));
    }

    /**
     * 게시물에 저장된 AI 요약 조회.
     *
     * <p><b>여기서 요약을 만들지 않는다.</b> 생성은 게시물을 작성할 때 저장소를 고르는 시점
     * ({@code /api/posts/analyze})에만 일어나고, 그 결과가 {@code posts.ai_summary}에 함께 저장된다.
     * 이 API는 그 값을 읽어 돌려주기만 한다.
     *
     * <p>조회 시점에 생성까지 허용하면 요약이 없는 게시물 전부가 호출 대상이 되어 비용이
     * 통제되지 않는다. 생성 지점을 하나로 묶어두는 편이 안전하다.
     *
     * <p>요약이 없으면 {@code summary}는 빈 문자열이다. 오류가 아니라 정상적인 상태이므로
     * 화면은 요약 영역을 그리지 않으면 된다.
     *
     * <p><b>GET이다.</b> 부수 효과가 없는 조회이므로 POST를 열어두지 않는다.
     * 프론트가 POST로 부르고 있다면 GET으로 바꿔야 한다.
     *
     * <p>덧붙여, 이 값은 {@code GET /api/posts/{post_id}} 응답의 {@code summary}와 같다.
     * 프론트가 상세 응답을 그대로 쓰게 되면 이 엔드포인트 자체가 필요 없어진다.
     */
    @GetMapping("/api/posts/{post_id}/ai-summary")
    public ResponseEntity<ApiResponse<AiSummaryResponse>> getAiSummary(
            @PathVariable("post_id") Long postId) {

        return ResponseEntity.ok(ApiResponse.success(
                AiSummaryResponse.builder()
                        .summary(postSummaryService.getSummary(postId))
                        .build()));
    }
}

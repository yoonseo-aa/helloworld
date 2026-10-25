package com.helloworld.domain.post.summary.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.List;

/**
 * 저장소 분석 응답 (POST /api/posts/analyze).
 *
 * <p>작성 폼에서 저장소를 고른 직후 부른다. 한 번의 응답으로 두 가지를 준다.
 * <ul>
 *   <li>{@link #techStacks} — 기술스택 태그를 자동 입력한다</li>
 *   <li>{@link #readme} — 본문 입력칸에 채울 요약 초안(마크다운)</li>
 * </ul>
 *
 * <p><b>왜 하나로 합쳤나</b> — 둘 다 "저장소를 고른 순간" 필요한 값이고, 재료(README·언어 통계)도
 * 같다. 나눠 두면 프론트가 두 번 부르고 GitHub도 두 번 왕복한다.
 *
 * <p><b>구조화 요약({@code RepoSummary})은 응답에 싣지 않는다.</b> 화면이 읽는 것은
 * {@code readme} 뿐이고, 저장은 서버가 캐시에서 직접 꺼내 처리한다 —
 * 프론트가 받아뒀다가 되돌려보낼 필요가 없다. 요약 항목을 따로 그리는 패널이 생기면
 * 그때 다시 실으면 된다.
 */
@Getter
@Builder
public class AnalyzeProjectResponse {

    /**
     * 기술스택 태그. 확인된 언어(GitHub 집계)를 앞에 두고, README에서 찾은 라이브러리를 뒤에 붙인다.
     *
     * <p>요약을 만들지 못했으면 언어만 담긴다 — 언어는 추론이 아니라 실제 파일에서 나온 값이라
     * LLM 없이도 확실하다.
     */
    private List<String> techStacks;

    /**
     * 본문 입력칸에 채울 요약 초안(마크다운).
     *
     * <p>한 줄 소개 · 프로젝트 목적 · 핵심 기능 · 프로젝트 특징을 한 덩어리 문서로 조립한 값이다.
     * 작성 폼이 이 값을 본문에 그대로 넣고, 작성자는 거기서부터 고쳐 쓴다 —
     * 빈 칸에서 시작하는 것보다 부담이 적다.
     *
     * <p>필드 이름이 {@code readme}인 것은 프론트 계약을 그대로 따르기 때문이다.
     * <b>README 원문이 아니다.</b> 원문을 그대로 넣으면 배지·설치법·라이선스까지 본문에
     * 들어와 읽을거리가 되지 못한다.
     *
     * <p>기술 스택은 넣지 않는다 — {@link #techStacks}로 태그 입력칸에 이미 들어가므로
     * 본문에 또 쓰면 같은 목록을 한 화면에서 두 번 읽게 된다.
     *
     * <p>요약을 만들지 못하면 <b>빈 문자열</b>이다. 프론트가 이 값을 본문 상태에 그대로 넣기
     * 때문에 null을 주면 화면이 깨진다(키가 생략되면 {@code undefined}가 들어간다).
     */
    @Builder.Default
    private String readme = "";
}

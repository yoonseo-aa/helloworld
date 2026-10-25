package com.helloworld.domain.post.summary.entity;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 게시물의 프로젝트 요약. {@code posts.ai_summary} 에 JSON 문자열로 저장된다.
 *
 * <p><b>왜 컬럼 하나에 JSON인가</b> — 게시물 1개에 요약 1개이고, 요약은 항상 게시물과 함께
 * 읽힌다. 같은 행에 있으니 조회가 공짜다. 요약 <b>안쪽 값으로 검색할 일도 없다</b>
 * (게시물 검색은 {@code content}의 FULLTEXT가 맡는다). 별도 테이블이나 다른 DB로 빼면
 * 게시물 하나 열 때마다 왕복이 하나 늘 뿐 얻는 게 없다.
 *
 * <p><b>컬럼 타입은 TEXT 그대로다.</b> JSON 타입으로 바꾸면 이 기능 이전에 저장된
 * 평문 요약들이 ALTER 단계에서 걸려 마이그레이션이 실패한다. TEXT에 JSON을 넣고,
 * 파싱되지 않는 옛 값은 "요약 없음"으로 취급하면 데이터 손질 없이 넘어간다.
 *
 * <p><b>상태 필드가 없는 이유</b> — 요약은 작성 폼에서 저장소를 고르는 순간 <b>동기로</b>
 * 만들어져 화면에 바로 보인다. 게시물이 저장될 때는 이미 결과가 확정돼 있어서
 * "만드는 중"이라는 중간 상태가 존재하지 않는다. 요약이 있거나, 없거나 둘 뿐이다.
 *
 * <p><b>기술 스택이 없는 이유</b> — 태그는 게시물 자체의 {@code tech_stacks}로 이미
 * 화면에 따로 뜬다. 요약 안에 또 넣으면 같은 목록이 한 화면에 두 번 나온다.
 * 다만 저장소 분석 응답의 최상위 {@code tech_stacks}는 그대로다 —
 * 작성 폼의 태그 입력칸을 채우는 값이라 여전히 필요하다.
 *
 * <p><b>근거 구분(README / 저장소 메타)도 없다</b> — README가 없으면 요약을 아예
 * 만들지 않기로 했다. 그래서 저장된 요약은 항상 README를 읽고 만든 것이다.
 *
 * @param oneLiner     한 줄 소개
 * @param purpose      주요 목적
 * @param keyFeatures  핵심 기능
 * @param highlights   프로젝트 특징
 * @param edited       작성자가 손댔는지. 화면의 "README 기반 자동 요약" 배지를 가른다.
 * @param generatedAt  생성 시각. 없으면 "언제 기준 요약인지" 알 수 없어 재생성 판단이 불가능하다.
 * @param model        사용한 모델. 모델을 바꿨을 때 옛 요약을 가려내려면 필요하다.
 */
public record RepoSummary(
        String oneLiner,
        String purpose,
        List<String> keyFeatures,
        List<String> highlights,
        boolean edited,
        LocalDateTime generatedAt,
        String model) {
}

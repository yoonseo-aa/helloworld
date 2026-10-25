package com.helloworld.domain.post.summary.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.helloworld.domain.post.summary.entity.RepoSummary;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * {@code posts.ai_summary} 의 JSON ↔ {@link RepoSummary} 변환.
 *
 * <p><b>파싱 실패를 오류로 다루지 않는다.</b> 이 기능 이전에는 같은 컬럼에 사용자가 쓴
 * <b>평문 요약</b>이 들어갔다. 그 값들은 JSON이 아니라서 반드시 파싱에 실패하는데,
 * 그건 데이터가 깨진 게 아니라 <b>형식이 바뀌기 전의 정상 데이터</b>다.
 * 빈 값으로 취급해 넘기면 컬럼 타입 변경도, 기존 행 손질도 필요 없다.
 *
 * <p>변환 지점을 한 곳에 모아 두는 것은 {@code GithubStatsCodec}과 같은 이유다 —
 * 매퍼 XML에 타입 핸들러로 흩어 두면 나중에 형태를 바꿀 때 어디를 봐야 할지 모르게 된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RepoSummaryCodec {

    private final ObjectMapper objectMapper;

    public String encode(RepoSummary summary) {
        try {
            return objectMapper.writeValueAsString(summary);
        } catch (Exception e) {
            // 여기까지 오면 직렬화 자체가 깨진 것이라 저장하면 안 된다.
            log.warn("프로젝트 요약 직렬화 실패", e);
            return null;
        }
    }

    /**
     * @return JSON이 아니거나(옛 평문 요약) 비어 있으면 {@code Optional.empty()}
     */
    public Optional<RepoSummary> decode(String json) {
        if (json == null || json.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(objectMapper.readValue(json, RepoSummary.class));
        } catch (Exception e) {
            // 형식 변경 이전에 저장된 평문 요약. 흔한 경우라 warn이 아니라 debug다.
            log.debug("ai_summary가 JSON 형식이 아닙니다 - 요약 없음으로 처리합니다.");
            return Optional.empty();
        }
    }
}

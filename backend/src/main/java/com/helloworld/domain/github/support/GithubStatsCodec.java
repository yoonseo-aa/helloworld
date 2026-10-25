package com.helloworld.domain.github.support;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.helloworld.domain.github.client.GithubGraphQlClient.DailyCommit;
import com.helloworld.global.exception.BusinessException;
import com.helloworld.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * {@code github_stats}의 JSON 컬럼 ↔ 자바 맵 변환.
 *
 * <pre>
 *   daily_commits: {"2026-08-03":[2,7]}        키=날짜, 값=[공개 커밋, 비공개 커밋]
 *   languages:     {"TypeScript":812340}       키=언어명, 값=코드 바이트 수
 * </pre>
 *
 * <p><b>왜 날짜가 배열 인덱스가 아니라 키인가</b> — 잔디 구간이 롤링(오늘 기준 최근 1년)이라
 * 매일 하루씩 밀린다. 366칸짜리 배열로 두면 "몇 번째 원소가 며칠인지"를 매번 계산해야 하고,
 * 그 계산이 하루라도 어긋나면 잔디가 <b>아무 오류 없이</b> 한 칸씩 밀린 채 그려진다.
 * 키가 날짜면 그 계산 자체가 존재하지 않는다.
 *
 * <p><b>왜 커밋 값이 객체가 아니라 2칸 배열인가</b> — {@code {"pub":2,"priv":7}} 로 하면 읽기는
 * 좋지만 필드명이 항목마다 반복돼 문서 크기가 두 배가 된다. 고정 길이 2라서 위치가
 * 헷갈릴 여지도 거의 없다.
 *
 * <p>변환 지점을 이 한 곳에 모아 둔다. MyBatis 타입 핸들러로 처리하면 엔티티가 Jackson에
 * 의존하고 변환 위치가 매퍼 XML로 흩어져서, 나중에 형태를 바꿀 때 어디를 봐야 할지 모르게 된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GithubStatsCodec {

    private static final TypeReference<Map<String, List<Integer>>> COMMIT_TYPE =
            new TypeReference<>() {};
    private static final TypeReference<Map<String, Long>> LANGUAGE_TYPE =
            new TypeReference<>() {};

    private final ObjectMapper objectMapper;

    /* ===== 일별 커밋 ===== */

    /**
     * 날짜별 커밋 → JSON 문자열.
     *
     * <p>{@link TreeMap}으로 정렬해서 쓴다. 조회 쪽은 날짜로 찾으니 순서에 의존하지 않지만,
     * DB에 든 값을 사람이 직접 열어 볼 때 날짜순이면 확인이 훨씬 쉽다.
     */
    public String encodeDailyCommits(Map<LocalDate, DailyCommit> dailyCommits) {
        Map<String, List<Integer>> raw = new TreeMap<>();
        for (Map.Entry<LocalDate, DailyCommit> e : dailyCommits.entrySet()) {
            DailyCommit c = e.getValue();
            raw.put(e.getKey().toString(), List.of(c.publicCount(), c.privateCount()));
        }
        return write(raw);
    }

    /**
     * JSON 문자열 → 날짜별 커밋.
     *
     * <p>형태가 어긋난 항목은 통째로 실패시키지 않고 건너뛴다. 잔디는 다시 받아올 수 있는
     * 파생 데이터라, 한 항목 때문에 프로필 조회가 500이 되는 것보다 그 칸만 비는 편이 낫다.
     */
    public Map<LocalDate, DailyCommit> decodeDailyCommits(String json) {
        Map<String, List<Integer>> raw = read(json, COMMIT_TYPE, "daily_commits");

        Map<LocalDate, DailyCommit> result = new LinkedHashMap<>();
        for (Map.Entry<String, List<Integer>> e : raw.entrySet()) {
            List<Integer> pair = e.getValue();
            if (pair == null || pair.size() < 2) {
                log.warn("daily_commits 항목 형태가 잘못됨 - 건너뜁니다. key={}, value={}",
                        e.getKey(), pair);
                continue;
            }
            try {
                result.put(LocalDate.parse(e.getKey()), new DailyCommit(pair.get(0), pair.get(1)));
            } catch (Exception ex) {
                log.warn("daily_commits 날짜 키가 잘못됨 - 건너뜁니다. key={}", e.getKey());
            }
        }
        return result;
    }

    /* ===== 언어별 코드량 ===== */

    /** 언어별 바이트 수 → JSON 문자열. 바이트 내림차순이 아니라 언어명순으로 정렬해 둔다(가독성). */
    public String encodeLanguages(Map<String, Long> languages) {
        return write(new TreeMap<>(languages));
    }

    /** JSON 문자열 → 언어별 바이트 수. 비율 계산과 상위 N개 추리기는 조회 계층이 한다. */
    public Map<String, Long> decodeLanguages(String json) {
        return read(json, LANGUAGE_TYPE, "languages");
    }

    /* ===== 공통 ===== */

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            // 여기까지 오면 직렬화 자체가 깨진 것이라 저장을 진행하면 안 된다.
            throw new BusinessException(ErrorCode.COMMON_SERVER_ERROR);
        }
    }

    private <T> Map<String, T> read(String json, TypeReference<Map<String, T>> type, String label) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            log.warn("{} JSON 파싱 실패 - 빈 값으로 처리합니다.", label, e);
            return Map.of();
        }
    }
}

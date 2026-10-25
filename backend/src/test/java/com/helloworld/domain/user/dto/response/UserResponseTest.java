package com.helloworld.domain.user.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.helloworld.domain.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * UserResponse 직렬화 검증 — GET /api/users/{id} 응답에 introduce가 실려 나가는지.
 *
 * <p>왜 단위 테스트로 두는가: 한줄소개 누락 버그는 "DTO에 필드가 없어서" 응답 JSON에서 키가
 * 통째로 빠지는 형태였다. 이 회귀는 서버를 띄우지 않고도 <b>앱과 동일한 Jackson 설정</b>
 * (snake_case + non_null)으로 직렬화해 보면 잡을 수 있다. 그래서 ObjectMapper를 application.yml의
 * {@code property-naming-strategy: SNAKE_CASE} / {@code default-property-inclusion: non_null}과
 * 똑같이 맞춘 뒤 결과 JSON을 직접 확인한다.
 */
class UserResponseTest {

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        // application.yml의 jackson 설정과 동일하게 맞춘다(그래야 실제 응답과 같은 JSON이 나온다).
        objectMapper = new ObjectMapper();
        objectMapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        objectMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    /** introduce는 @Builder 생성자에 없어 setter로 넣는다(User는 @Setter). */
    private User user(Long id, String introduce) {
        User u = User.builder()
                .authProvider("LOCAL")
                .email("user@test.com")
                .nickname("권영민")
                .build();
        u.setUserId(id);
        u.setIntroduce(introduce);
        return u;
    }

    private JsonNode serialize(UserResponse response) throws Exception {
        return objectMapper.readTree(objectMapper.writeValueAsString(response));
    }

    @Test
    @DisplayName("소개글이 있으면 응답 JSON의 introduce에 값이 담기고, 키는 snake_case로 나간다")
    void introducePresent_isIncludedInSnakeCaseJson() throws Exception {
        UserResponse response = UserResponse.from(user(32L, "백엔드를 배우는 중입니다."));

        // from()이 값을 실어 옮겼는지(매퍼→DTO 조립 지점)
        assertThat(response.getIntroduce()).isEqualTo("백엔드를 배우는 중입니다.");

        JsonNode json = serialize(response);
        assertThat(json.has("introduce")).isTrue();
        assertThat(json.get("introduce").asText()).isEqualTo("백엔드를 배우는 중입니다.");
        // 필드명이 snake_case로 나가는지도 함께 확인(계약 회귀 방지)
        assertThat(json.get("user_id").asLong()).isEqualTo(32L);
    }

    @Test
    @DisplayName("소개글이 null이면 non_null 정책에 따라 introduce 키가 응답에서 빠진다")
    void introduceNull_isOmittedUnderNonNullPolicy() throws Exception {
        UserResponse response = UserResponse.from(user(32L, null));

        assertThat(response.getIntroduce()).isNull();

        JsonNode json = serialize(response);
        // 키 자체가 없어야 한다(값이 null인 채로 담기면 안 됨) — 프론트가 undefined로 처리하는 계약.
        assertThat(json.has("introduce")).isFalse();
        // 값이 있는 필드는 정상적으로 나온다(전체가 빠진 게 아님을 확인).
        assertThat(json.get("user_id").asLong()).isEqualTo(32L);
    }

    @Test
    @DisplayName("소개글이 빈 문자열이면 non_null 정책과 무관하게 키가 유지된다 (null만 생략)")
    void introduceEmptyString_keepsKey() throws Exception {
        // non_null은 '값이 null'일 때만 키를 뺀다. ""는 엄연히 값이라 키가 남아야 한다.
        // (프론트가 "소개 없음"과 "빈 소개"를 구분하거나, 빈 문자열을 그대로 렌더할 수 있게.)
        UserResponse response = UserResponse.from(user(32L, ""));

        assertThat(response.getIntroduce()).isEmpty();

        JsonNode json = serialize(response);
        assertThat(json.has("introduce")).isTrue();
        assertThat(json.get("introduce").asText()).isEmpty();
    }
}

package com.helloworld.domain.user.controller;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.helloworld.domain.tag.dto.response.TagResponse;
import com.helloworld.domain.user.dto.response.UserResponse;
import com.helloworld.domain.user.service.ProfileService;
import com.helloworld.domain.user.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/users/{id} 엔드포인트 레벨 검증(MockMvc).
 *
 * <p>DispatcherServlet → UserController → ApiResponse 래핑 → Jackson 직렬화까지 실제로 태운다.
 * 서비스만 목으로 대체해 "DB에서 조회된 유저"를 흉내 내고, <b>응답 HTTP 바디에 introduce가
 * 노출되는지 / null이면 키가 빠지는지</b>를 최종 JSON에서 확인한다.
 *
 * <p>왜 {@code @WebMvcTest}가 아니라 standalone인가: 이 프로젝트는 명시적 {@code @MapperScan}을
 * 쓰기 때문에 {@code @WebMvcTest} 슬라이스에서도 MyBatis 매퍼 빈이 함께 로드되어
 * sqlSessionFactory가 없어 컨텍스트가 깨진다(그리고 인증 필터는 JwtTokenProvider를 요구한다).
 * standalone은 스프링 컨텍스트 없이 컨트롤러만 감싸므로 그 마찰이 없고, 검증 대상인 "응답 JSON"에
 * 집중할 수 있다. 대신 앱과 동일한 Jackson 설정(application.yml의 SNAKE_CASE + non_null)을
 * 컨버터에 직접 맞춰 실제 응답과 같은 JSON이 나오게 한다.
 *
 * <p>실제 SQL(selectById의 introduce 컬럼) 경로는 이 테스트의 관심 밖이며(서비스 목),
 * UserResponse 단위 테스트 + 로컬 E2E로 별도 검증됐다.
 */
class UserControllerTest {

    private MockMvc mockMvc;
    private UserService userService;
    private ProfileService profileService;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        profileService = mock(ProfileService.class);

        // application.yml의 jackson 설정과 동일하게 맞춘 컨버터를 꽂는다(실제 응답과 같은 JSON을 위해).
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
        objectMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);

        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userService, profileService))
                .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
                .build();
    }

    @Test
    @DisplayName("소개글이 있으면 응답 data.introduce에 값이 실려 나온다 (키는 snake_case)")
    void getUser_withIntroduce_exposesItInBody() throws Exception {
        given(userService.getUser(32L)).willReturn(
                UserResponse.builder()
                        .userId(32L)
                        .email("user@test.com")
                        .nickname("권영민")
                        .introduce("백엔드를 배우는 중입니다.")
                        .build());

        mockMvc.perform(get("/api/users/{id}", 32L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.data.user_id").value(32))
                .andExpect(jsonPath("$.data.introduce").value("백엔드를 배우는 중입니다."));
    }

    @Test
    @DisplayName("소개글이 null이면 non_null 정책으로 응답에서 introduce 키가 빠진다")
    void getUser_withoutIntroduce_omitsKey() throws Exception {
        given(userService.getUser(32L)).willReturn(
                UserResponse.builder()
                        .userId(32L)
                        .email("user@test.com")
                        .nickname("권영민")
                        .introduce(null)
                        .build());

        mockMvc.perform(get("/api/users/{id}", 32L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user_id").value(32))
                .andExpect(jsonPath("$.data.introduce").doesNotExist());
    }

    @Test
    @DisplayName("GET /{id}/interests: 관심 태그가 있으면 TagResponse 배열로 내려온다")
    void getUserInterests_returnsTagList() throws Exception {
        given(profileService.getInterests(32L)).willReturn(List.of(
                TagResponse.builder().tagId(3L).tagType("TECH").tagName("React").build(),
                TagResponse.builder().tagId(7L).tagType("TECH").tagName("MySQL").build()));

        mockMvc.perform(get("/api/users/{id}/interests", 32L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].tag_id").value(3))
                .andExpect(jsonPath("$.data[0].tag_name").value("React"))
                .andExpect(jsonPath("$.data[1].tag_type").value("TECH"));
    }

    @Test
    @DisplayName("GET /{id}/interests: 선택한 태그가 없으면 빈 배열이다 (오류 아님)")
    void getUserInterests_emptyWhenNone() throws Exception {
        given(profileService.getInterests(32L)).willReturn(List.of());

        mockMvc.perform(get("/api/users/{id}/interests", 32L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    @DisplayName("GET /{id}/interests: 존재하지 않는 사용자면 404가 아니라 빈 배열이다 (스펙상 존재 검사 안 함)")
    void getUserInterests_unknownUser_returnsEmptyArrayNot404() throws Exception {
        // 조인 조회라 없는 userId는 결과 0건 → 컨트롤러는 404를 내지 않고 빈 배열로 응답한다.
        // (프론트 스펙: "본인 여부는 보지 않는다 / 항목이 없으면 빈 배열 — 오류가 아니다")
        given(profileService.getInterests(999_999L)).willReturn(List.of());

        mockMvc.perform(get("/api/users/{id}/interests", 999_999L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    @DisplayName("GET /{id}/interests: 태그 이름의 특수문자·이모지·따옴표가 JSON에 손실 없이 실린다")
    void getUserInterests_specialCharsAndEmoji_serializeLosslessly() throws Exception {
        // 이모지(멀티바이트), JSON에서 이스케이프가 필요한 문자("), HTML 유사 토큰(<>&)이
        // 직렬화·역직렬화를 거쳐도 원문 그대로 보존되는지 확인한다.
        String tricky = "C++ & Go <React/> 🦀🚀 \"따옴표\"";
        given(profileService.getInterests(32L)).willReturn(List.of(
                TagResponse.builder().tagId(1L).tagType("TECH").tagName(tricky).build()));

        mockMvc.perform(get("/api/users/{id}/interests", 32L))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].tag_name").value(tricky));
    }
}

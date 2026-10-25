package com.helloworld.global.config;

import com.helloworld.global.security.LoginUserIdArgumentResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * 웹 MVC 설정.
 * - CORS: 프론트 개발/배포 도메인을 허용한다.
 * - ArgumentResolver: @LoginUserId 파라미터 주입용 리졸버 등록.
 * TODO: 실제 프론트 도메인으로 교체. 와일드카드(*)와 allowCredentials(true)는 함께 못 쓰므로 도메인 명시.
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final LoginUserIdArgumentResolver loginUserIdArgumentResolver;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(loginUserIdArgumentResolver);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:3000",       // 프론트 로컬
                        "https://i15e204.p.ssafy.io"      // TODO: 실제 배포 도메인
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)                // Refresh Token 쿠키 전송용
                .maxAge(3600);
    }
}

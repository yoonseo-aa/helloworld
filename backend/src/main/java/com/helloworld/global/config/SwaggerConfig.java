package com.helloworld.global.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.helloworld.global.security.LoginUserId;
import io.swagger.v3.core.jackson.ModelResolver;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger(OpenAPI) 설정. 실행 후 /swagger-ui/index.html 에서 확인.
 * JWT Bearer 인증을 문서에 노출.
 */
@Configuration
public class SwaggerConfig {

    private static final String SECURITY_SCHEME = "bearerAuth";

    static {
        // @LoginUserId 로 주입되는 파라미터는 인증에서 자동으로 채워지므로,
        // Swagger 문서/입력창에 노출하지 않도록 무시 처리한다.
        SpringDocUtils.getConfig().addAnnotationsToIgnore(LoginUserId.class);
    }

    /**
     * Swagger 스키마 생성이 스프링의 ObjectMapper(SNAKE_CASE 설정)를 따르게 한다.
     * 이 빈이 없으면 문서에는 camelCase(userId)로 나오는데 실제 응답은 snake_case(user_id)라
     * 프론트가 Swagger만 보고 개발하면 필드명이 어긋난다.
     */
    @Bean
    public ModelResolver modelResolver(ObjectMapper objectMapper) {
        return new ModelResolver(objectMapper);
    }

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Hello World API")
                        .description("개발자 SNS Hello World 백엔드 API 문서")
                        .version("v1"))
                .addSecurityItem(new SecurityRequirement().addList(SECURITY_SCHEME))
                .components(new Components().addSecuritySchemes(SECURITY_SCHEME,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}

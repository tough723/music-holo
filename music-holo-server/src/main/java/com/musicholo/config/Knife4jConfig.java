package com.musicholo.config;

import io.swagger.v3.oas.models.ExternalDocumentation;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Knife4j API 文档配置，启动后访问 http://localhost:8080/doc.html
 */
@Configuration
public class Knife4jConfig {

    @Bean
    public OpenAPI openAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("3D全息投影音乐播放平台 API 文档")
                        .description("music-holo 后端接口文档，基于 Knife4j + OpenAPI3")
                        .version("1.0.0"))
                .externalDocs(new ExternalDocumentation()
                        .description("Knife4j 官方文档")
                        .url("https://doc.xiaominfo.com"));
    }

    @Bean
    public GroupedOpenApi allApi() {
        return GroupedOpenApi.builder()
                .group("全部接口")
                .pathsToMatch("/**")
                .build();
    }
}

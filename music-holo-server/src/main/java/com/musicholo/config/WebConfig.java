package com.musicholo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

/**
 * Web MVC 配置（跨域 + 本地上传文件静态映射）
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${music-holo.upload-path:./upload/}")
    private String uploadPath;

    /**
     * 前后端分离跨域配置
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }

    /**
     * 将 /profile/** 映射到本地上传目录，用于访问上传的头像、音频等文件
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = uploadPath.endsWith("/") ? uploadPath : uploadPath + "/";
        String absolute = new File(location).getAbsolutePath();
        registry.addResourceHandler("/profile/**")
                .addResourceLocations("file:" + absolute + "/");
    }
}

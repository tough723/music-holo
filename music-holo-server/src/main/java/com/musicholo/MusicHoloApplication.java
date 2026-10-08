package com.musicholo;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 3D全息投影音乐播放平台 - 启动类
 */
@MapperScan("com.musicholo.mapper")
@SpringBootApplication
public class MusicHoloApplication {

    public static void main(String[] args) {
        SpringApplication.run(MusicHoloApplication.class, args);
        System.out.println("==================================================");
        System.out.println("  music-holo-server 启动成功！");
        System.out.println("  API 文档地址: http://localhost:8080/doc.html");
        System.out.println("==================================================");
    }
}

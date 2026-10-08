package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.io.Serializable;

/**
 * 主题修改请求
 */
@Data
public class ThemeDTO implements Serializable {

    /** 主题标识：cyan / magenta / amber / lime */
    @NotBlank(message = "主题不能为空")
    private String theme;

    /** 作用范围：user 个人 / global 全局（全局仅管理员可设置） */
    private String scope = "user";
}

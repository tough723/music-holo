package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.io.Serializable;

/**
 * 注册请求
 */
@Data
public class RegisterDTO implements Serializable {

    @NotBlank(message = "用户名不能为空")
    @Pattern(regexp = "^[a-zA-Z0-9_]{3,20}$", message = "用户名需为3-20位字母、数字或下划线")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Pattern(regexp = "^.{6,32}$", message = "密码长度需为6-32位")
    private String password;

    /** 昵称（可选，默认取用户名） */
    private String nickname;
}

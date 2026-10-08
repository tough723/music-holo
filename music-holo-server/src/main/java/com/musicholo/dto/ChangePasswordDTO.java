package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.io.Serializable;

/**
 * 修改密码请求
 */
@Data
public class ChangePasswordDTO implements Serializable {

    @NotBlank(message = "原密码不能为空")
    private String oldPassword;

    @NotBlank(message = "新密码不能为空")
    @Pattern(regexp = "^.{6,32}$", message = "新密码长度需为6-32位")
    private String newPassword;
}

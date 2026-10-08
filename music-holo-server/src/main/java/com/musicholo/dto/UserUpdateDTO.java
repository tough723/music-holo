package com.musicholo.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.io.Serializable;

/**
 * 用户资料修改请求
 */
@Data
public class UserUpdateDTO implements Serializable {

    private String nickname;

    private String avatar;

    @Email(message = "邮箱格式不正确")
    private String email;

    private String phone;

    @Min(value = 0, message = "性别取值不正确")
    @Max(value = 2, message = "性别取值不正确")
    private Integer gender;

    /** 个性化主题 */
    private String theme;
}

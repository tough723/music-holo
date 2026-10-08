package com.musicholo.vo;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.io.Serializable;

/**
 * 登录响应
 */
@Data
@AllArgsConstructor
public class LoginVO implements Serializable {

    /** Sa-Token 登录凭证 */
    private String token;

    /** 用户信息 */
    private UserVO userInfo;
}

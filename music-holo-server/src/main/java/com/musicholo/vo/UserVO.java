package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户信息视图（不含密码）
 */
@Data
public class UserVO implements Serializable {

    private Long id;

    private String username;

    private String nickname;

    private String avatar;

    private String email;

    private String phone;

    /** 性别：0未知 1男 2女 */
    private Integer gender;

    /** 角色：0管理员 1普通用户 */
    private Integer role;

    private String theme;

    private Integer status;

    private LocalDateTime createTime;
}

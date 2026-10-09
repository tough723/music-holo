package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌手新增 / 修改请求（id 为空表示新增）
 */
@Data
public class SingerSaveDTO implements Serializable {

    private Long id;

    @NotBlank(message = "歌手名称不能为空")
    private String name;

    /** 性别：0未知 1男 2女 */
    private Integer gender;

    /** 地区 */
    private String region;

    /** 简介 */
    private String intro;

    /** 头像地址 */
    private String avatar;

    /** 排序号 */
    private Integer sort;
}

package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌单新增 / 修改请求（id 为空表示新增）
 */
@Data
public class PlaylistSaveDTO implements Serializable {

    private Long id;

    @NotBlank(message = "歌单名称不能为空")
    private String name;

    private String cover;

    private String description;

    /** 是否公开：0私密 1公开 */
    private Integer isPublic;
}

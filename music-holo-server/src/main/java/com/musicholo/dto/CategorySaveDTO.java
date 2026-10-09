package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌曲分类新增 / 修改请求（id 为空表示新增）
 */
@Data
public class CategorySaveDTO implements Serializable {

    private Long id;

    @NotBlank(message = "分类名称不能为空")
    private String name;

    /** 父级分类 id，0 表示顶级 */
    private Long parentId;

    /** 排序号 */
    private Integer sort;
}

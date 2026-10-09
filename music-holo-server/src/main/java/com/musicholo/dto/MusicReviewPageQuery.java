package com.musicholo.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class MusicReviewPageQuery {

    /** 公共列表必填；管理端列表可留空。 */
    @Pattern(regexp = "song|playlist", message = "短评对象类型无效")
    private String targetType;

    private Long targetId;

    /** 管理端可按 0=隐藏、1=公开、2=作者已删除筛选。 */
    @Min(value = 0, message = "状态值无效")
    @Max(value = 2, message = "状态值无效")
    private Integer status;

    @Min(value = 1, message = "页码至少为 1")
    private long pageNum = 1;

    @Min(value = 1, message = "每页数量至少为 1")
    @Max(value = 50, message = "每页最多 50 条")
    private long pageSize = 10;
}

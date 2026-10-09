package com.musicholo.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MusicReviewVisibilityDTO {

    @NotNull(message = "短评状态不能为空")
    private Boolean hidden;

    @Size(max = 300, message = "审核说明最多 300 个字符")
    private String note;
}

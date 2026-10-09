package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MusicReviewReportActionDTO {

    @NotBlank(message = "请选择处理方式")
    @Pattern(regexp = "hide|dismiss", message = "处理方式无效")
    private String action;

    @Size(max = 300, message = "处理备注最多 300 个字符")
    private String note;
}

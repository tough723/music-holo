package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MusicReviewReportDTO {

    @NotBlank(message = "请选择举报原因")
    @Pattern(regexp = "spam|abuse|copyright|other", message = "举报原因无效")
    private String reason;

    @Size(max = 300, message = "补充说明最多 300 个字符")
    private String details;
}

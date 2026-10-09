package com.musicholo.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MusicReviewCreateDTO {

    @NotBlank(message = "短评对象类型不能为空")
    @Pattern(regexp = "song|playlist", message = "短评对象类型无效")
    private String targetType;

    @NotNull(message = "短评对象不能为空")
    @Positive(message = "短评对象无效")
    private Long targetId;

    @NotBlank(message = "短评内容不能为空")
    @Size(max = 500, message = "短评最多 500 个字符")
    private String content;
}

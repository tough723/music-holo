package com.musicholo.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MusicReviewLikeDTO {

    @NotNull(message = "点赞状态不能为空")
    private Boolean liked;
}

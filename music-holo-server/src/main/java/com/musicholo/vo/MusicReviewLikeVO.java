package com.musicholo.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MusicReviewLikeVO {

    private Boolean liked;

    private Integer likeCount;
}

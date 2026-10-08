package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class MusicReviewVO implements Serializable {

    private Long id;
    private String targetType;
    private Long targetId;
    private String targetTitle;
    private Long authorId;
    private String authorName;
    private String authorAvatar;
    private String content;
    private Integer likeCount;
    /** 0 hidden, 1 visible, 2 author-deleted; public API only includes the author's own hidden item. */
    private Integer status;
    private Boolean mine;
    private Boolean liked;
    private String moderationNote;
    private LocalDateTime createTime;
}

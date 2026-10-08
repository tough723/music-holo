package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 歌单视图
 */
@Data
public class PlaylistVO implements Serializable {

    private Long id;

    private String name;

    private String cover;

    private String description;

    private Long creatorId;

    /** 创建者昵称（关联查询填充） */
    private String creatorName;

    /** 是否公开：0私密 1公开 */
    private Integer isPublic;

    private Long playCount;

    /** 歌单内歌曲数量 */
    private Long songCount;

    private LocalDateTime createTime;
}

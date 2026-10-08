package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 歌手视图
 */
@Data
public class SingerVO implements Serializable {

    private Long id;

    private String name;

    /** 性别：0未知 1男 2女 */
    private Integer gender;

    private String region;

    private String intro;

    private String avatar;

    private Integer sort;

    private Integer status;

    /** 歌曲数量 */
    private Long songCount;

    private LocalDateTime createTime;
}

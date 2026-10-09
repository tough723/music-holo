package com.musicholo.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 歌手分页查询条件
 */
@Data
public class SingerQuery implements Serializable {

    private long pageNum = 1;

    private long pageSize = 12;

    /** 关键字（歌手名称模糊匹配） */
    private String keyword;

    /** 性别：0未知 1男 2女 */
    private Integer gender;

    /** 地区 */
    private String region;
}

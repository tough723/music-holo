package com.musicholo.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 歌曲分页查询条件
 */
@Data
public class SongQuery implements Serializable {

    /** 页码，从 1 开始 */
    private long pageNum = 1;

    /** 每页条数 */
    private long pageSize = 10;

    /** 关键字（标题 / 专辑名模糊匹配） */
    private String keyword;

    /** 分类 id */
    private Long categoryId;

    /** 歌手 id */
    private Long singerId;
}

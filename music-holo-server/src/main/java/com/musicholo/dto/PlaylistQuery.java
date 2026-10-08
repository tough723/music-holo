package com.musicholo.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 歌单分页查询条件
 */
@Data
public class PlaylistQuery implements Serializable {

    private long pageNum = 1;

    private long pageSize = 12;

    /** 关键字（歌单名称模糊匹配） */
    private String keyword;

    /** 是否只看自己创建的歌单 */
    private Boolean onlyMine;
}

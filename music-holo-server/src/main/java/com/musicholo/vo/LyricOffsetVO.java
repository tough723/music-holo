package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;

/**
 * 一首歌的歌词时间轴校正结果。offsetMs 为 null 表示还没有形成共识。
 */
@Data
public class LyricOffsetVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 歌曲 id */
    private Long songId;

    /** 共识偏移毫秒；不足生效门槛时为 null */
    private Integer offsetMs;

    /** 参与上报的账号数 */
    private Integer count;

    /** 生效所需的最少上报数 */
    private Integer minReports;

    /** 当前账号上报的偏移；未上报为 null */
    private Integer mine;
}

package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/** 由歌曲曲库聚合得到的专辑视图，不引入重复的专辑主数据表。 */
@Data
public class AlbumVO implements Serializable {

    private String album;

    private Long singerId;

    private String singerName;

    private String cover;

    private Long songCount;

    private Long playCount;

    private LocalDateTime latestSongTime;
}

package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 歌曲视图
 */
@Data
public class SongVO implements Serializable {

    private Long id;

    private String title;

    private Long singerId;

    /** 歌手名称（关联查询填充） */
    private String singerName;

    private Long categoryId;

    /** 分类名称（关联查询填充） */
    private String categoryName;

    private String album;

    /** 时长（秒） */
    private Integer duration;

    private String cover;

    private String audioUrl;

    /** 歌词内容（LRC 格式文本，列表接口不返回，详情接口返回） */
    private String lyric;

    /** 译文歌词（LRC 格式文本，列表接口不返回，详情接口返回） */
    private String lyricTranslation;

    /** 罗马音歌词（LRC 格式文本，列表接口不返回，详情接口返回） */
    private String lyricRomaji;

    private Integer status;

    private Long playCount;

    /** LUFS 实测响度；音频预扫描未实现前恒为 null */
    private BigDecimal loudness;

    /** 当前用户是否已收藏（未登录时为 false） */
    private Boolean favorite;

    private LocalDateTime createTime;
}

package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 歌曲
 */
@Data
@TableName("song")
public class Song implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 歌曲标题 */
    private String title;

    /** 歌手 id */
    private Long singerId;

    /** 分类 id */
    private Long categoryId;

    /** 专辑名 */
    private String album;

    /** 时长（秒） */
    private Integer duration;

    /** 封面地址 */
    private String cover;

    /** 音频地址 */
    private String audioUrl;

    /** 歌词内容（LRC 格式文本） */
    private String lyric;

    /** 状态：0下架 1正常 */
    private Integer status;

    /** 播放量 */
    private Long playCount;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

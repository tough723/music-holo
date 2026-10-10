package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 歌词时间轴校正上报。只保存偏移毫秒数，不复制歌词内容，也不改曲库原文。
 */
@Data
@TableName("lyric_offset_correction")
public class LyricOffsetCorrection implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 提交账号 */
    private Long userId;

    /** 歌曲 id */
    private Long songId;

    /** 偏移毫秒，正值＝歌词提前出现 */
    private Integer offsetMs;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/** 歌曲或歌单短评；状态：0 已隐藏，1 公开，2 作者已删除。 */
@Data
@TableName("music_review")
public class MusicReview implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final int STATUS_HIDDEN = 0;
    public static final int STATUS_VISIBLE = 1;
    public static final int STATUS_DELETED = 2;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** song / playlist */
    private String targetType;

    private Long targetId;

    private Long userId;

    private String content;

    private Integer likeCount;

    private Integer status;

    /** 管理员隐藏时给作者看的简短说明 */
    private String moderationNote;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

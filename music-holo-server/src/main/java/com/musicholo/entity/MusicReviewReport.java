package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/** 短评举报；状态：0 待处理，1 已隐藏并处理，2 已驳回。 */
@Data
@TableName("music_review_report")
public class MusicReviewReport implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final int STATUS_OPEN = 0;
    public static final int STATUS_RESOLVED = 1;
    public static final int STATUS_DISMISSED = 2;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private Long reviewId;

    private Long reporterId;

    /** spam / abuse / copyright / other */
    private String reason;

    private String details;

    private Integer status;

    /** hide / dismiss */
    private String action;

    private Long handledBy;

    private String adminNote;

    private LocalDateTime handledAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

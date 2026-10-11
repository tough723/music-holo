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
 * 用户收听行为事件。客户端批量上报，(user_id, event_id) 唯一，重复上报按重复计数丢弃。
 */
@Data
@TableName("user_stat_event")
public class UserStatEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 上报账号 */
    private Long userId;

    /** 客户端生成的事件幂等键，最长 64 */
    private String eventId;

    /** 事件类型：play / skip / complete / error */
    private String eventType;

    /** 歌曲 id，可为空（如播放器初始化失败） */
    private Long songId;

    /** 曲目时长（秒），已归一化到 0..3600 */
    private Integer durationSec;

    /** 事件发生时的播放位置（秒），已归一化到 0..duration */
    private Integer positionSec;

    /** 折算收听时长（秒），汇总只统计该列 */
    private Integer seconds;

    /** 事件发生时间（客户端时间，已限制在 180 天内） */
    private LocalDateTime occurredAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}

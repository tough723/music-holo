package com.musicholo.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 单条收听事件上报。字段全部宽松接收，校验与折算规则见 {@code StatEventRules}。
 */
@Data
public class StatEventDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 客户端生成的幂等键（最长 64） */
    private String eventId;

    /** 事件类型：play / skip / complete / error */
    private String type;

    /** 歌曲 id，允许为空 */
    private Long songId;

    /** 曲目时长（秒） */
    private Integer duration;

    /** 事件发生时的播放位置（秒） */
    private Integer position;

    /** 客户端自报的收听秒数，仅在 skip 且没有 position 时采用 */
    private Integer seconds;

    /** 事件发生时间（epoch 毫秒） */
    private Long at;
}

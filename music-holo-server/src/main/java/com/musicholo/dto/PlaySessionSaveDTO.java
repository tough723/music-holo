package com.musicholo.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 播放会话快照上报：队列 + 当前曲目 + 进度 + 模式 + 倍速。
 * <p>
 * 具体校验规则见 {@code PlaySessionRules}，服务端只做参数归一化，不做业务写入。
 */
@Data
public class PlaySessionSaveDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 播放队列的歌曲 id，按播放顺序 */
    private List<Long> queueIds;

    /** 当前播放的歌曲 id；null 表示没有当前曲目 */
    private Long currentSongId;

    /** 当前曲目的播放进度（秒） */
    private Double position;

    /** 播放模式：order / loop / single / random / shuffle / heart */
    private String mode;

    /** 播放倍速：0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2 */
    private Double playbackRate;
}

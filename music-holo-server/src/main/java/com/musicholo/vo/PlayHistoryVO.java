package com.musicholo.vo;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/** 最近播放列表项（继承歌曲字段，附带用户自己的播放统计） */
@Data
@EqualsAndHashCode(callSuper = true)
public class PlayHistoryVO extends SongVO {

    private Integer personalPlayCount;

    private LocalDateTime lastPlayedAt;
}

package com.musicholo.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌词保存请求
 */
@Data
public class LyricSaveDTO implements Serializable {

    @NotNull(message = "歌曲 id 不能为空")
    private Long songId;

    /** 歌词内容（LRC 格式文本） */
    private String lyric;
}

package com.musicholo.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌曲新增 / 修改请求（id 为空表示新增）
 */
@Data
public class SongSaveDTO implements Serializable {

    private Long id;

    @NotBlank(message = "歌曲标题不能为空")
    private String title;

    @NotNull(message = "歌手不能为空")
    private Long singerId;

    @NotNull(message = "歌曲分类不能为空")
    private Long categoryId;

    private String album;

    @NotNull(message = "歌曲时长不能为空")
    @Min(value = 1, message = "歌曲时长必须大于0秒")
    private Integer duration;

    private String cover;

    @NotBlank(message = "音频地址不能为空")
    private String audioUrl;

    /** 歌词（LRC 格式文本） */
    private String lyric;

    /** 可选译文歌词（独立 LRC 格式） */
    private String lyricTranslation;

    /** 可选罗马音歌词（独立 LRC 格式，仅用户导入） */
    private String lyricRomaji;

    /** 状态：0下架 1正常 */
    private Integer status;
}

package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 歌词解析结果
 */
@Data
public class LyricVO implements Serializable {

    private Long songId;

    private String title;

    /** 按时间升序排列的原歌词行 */
    private List<LyricLine> lines;

    /** 按时间升序排列的译文歌词行；无译文时为空数组 */
    private List<LyricLine> translationLines;

    /** 按时间升序排列的罗马音歌词行；未导入时为空数组 */
    private List<LyricLine> romajiLines;
}

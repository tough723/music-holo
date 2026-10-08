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

    /** 按时间升序排列的歌词行 */
    private List<LyricLine> lines;
}

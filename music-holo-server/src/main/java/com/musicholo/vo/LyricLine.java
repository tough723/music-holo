package com.musicholo.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 单行歌词（解析后的结构化数据）
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LyricLine implements Serializable {

    /** 时间戳（秒，含小数） */
    private Double time;

    /** 歌词文本 */
    private String text;
}

package com.musicholo.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌词时间轴校正提交请求
 */
@Data
public class LyricOffsetSubmitDTO implements Serializable {

    @NotNull(message = "歌曲 id 不能为空")
    private Long songId;

    /** 偏移毫秒，正值＝歌词提前出现；范围 ±5000，与前端时间校准一致 */
    @NotNull(message = "偏移不能为空")
    private Integer offsetMs;
}

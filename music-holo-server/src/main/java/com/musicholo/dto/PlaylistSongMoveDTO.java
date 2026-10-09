package com.musicholo.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.io.Serializable;

/**
 * 歌单内把一首歌曲上移或下移一位。direction 只能是 -1 或 1。
 */
@Data
public class PlaylistSongMoveDTO implements Serializable {

    @NotNull(message = "歌曲不能为空")
    private Long songId;

    /** -1 上移一位，1 下移一位 */
    @NotNull(message = "移动方向不能为空")
    private Integer direction;
}

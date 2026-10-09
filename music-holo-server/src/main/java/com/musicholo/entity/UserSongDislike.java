package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 用户不喜欢的歌曲。只影响自动切歌和推荐，不删除曲库。
 */
@Data
@TableName("user_song_dislike")
public class UserSongDislike implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 用户 id */
    private Long userId;

    /** 歌曲 id */
    private Long songId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}

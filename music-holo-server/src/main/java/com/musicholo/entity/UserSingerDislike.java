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
 * 用户不喜欢的歌手。命中后跳过该歌手的曲库歌曲，不删除歌手或歌曲。
 */
@Data
@TableName("user_singer_dislike")
public class UserSingerDislike implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 用户 id */
    private Long userId;

    /** 歌手 id */
    private Long singerId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}

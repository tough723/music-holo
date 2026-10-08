package com.musicholo.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 歌手
 */
@Data
@TableName("singer")
public class Singer implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    /** 歌手名称 */
    private String name;

    /** 性别：0未知 1男 2女 */
    private Integer gender;

    /** 地区（如：内地 / 港台 / 欧美 / 日韩） */
    private String region;

    /** 简介 */
    private String intro;

    /** 头像地址 */
    private String avatar;

    /** 排序号（越小越靠前） */
    private Integer sort;

    /** 状态：0下架 1正常 */
    private Integer status;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

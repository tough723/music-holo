package com.musicholo.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 代码表（字典数据）视图
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DictVO implements Serializable {

    /** 显示标签 */
    private String label;

    /** 实际值 */
    private String value;
}

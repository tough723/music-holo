package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.Singer;
import org.apache.ibatis.annotations.Mapper;

/**
 * Singer Mapper 接口
 */
@Mapper
public interface SingerMapper extends BaseMapper<Singer> {
}

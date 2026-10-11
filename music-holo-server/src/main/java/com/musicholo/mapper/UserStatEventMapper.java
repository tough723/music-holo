package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.UserStatEvent;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户收听事件 Mapper
 */
@Mapper
public interface UserStatEventMapper extends BaseMapper<UserStatEvent> {
}

package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.UserSingerDislike;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户不喜欢歌手 Mapper
 */
@Mapper
public interface UserSingerDislikeMapper extends BaseMapper<UserSingerDislike> {
}

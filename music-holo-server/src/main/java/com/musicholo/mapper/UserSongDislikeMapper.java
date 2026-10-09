package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.UserSongDislike;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户不喜欢歌曲 Mapper
 */
@Mapper
public interface UserSongDislikeMapper extends BaseMapper<UserSongDislike> {
}

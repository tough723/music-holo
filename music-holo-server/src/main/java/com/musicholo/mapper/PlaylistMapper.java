package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.Playlist;
import org.apache.ibatis.annotations.Mapper;

/**
 * Playlist Mapper 接口
 */
@Mapper
public interface PlaylistMapper extends BaseMapper<Playlist> {
}

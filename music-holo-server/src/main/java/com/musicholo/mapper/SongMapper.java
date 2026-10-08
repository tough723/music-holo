package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.Song;
import org.apache.ibatis.annotations.Mapper;

/**
 * Song Mapper 接口
 */
@Mapper
public interface SongMapper extends BaseMapper<Song> {
}

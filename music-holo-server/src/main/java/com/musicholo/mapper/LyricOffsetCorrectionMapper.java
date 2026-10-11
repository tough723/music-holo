package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.LyricOffsetCorrection;
import org.apache.ibatis.annotations.Mapper;

/**
 * 歌词时间轴校正 Mapper
 */
@Mapper
public interface LyricOffsetCorrectionMapper extends BaseMapper<LyricOffsetCorrection> {
}

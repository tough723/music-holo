package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.UserFavorite;
import org.apache.ibatis.annotations.Mapper;

/**
 * UserFavorite Mapper 接口
 */
@Mapper
public interface UserFavoriteMapper extends BaseMapper<UserFavorite> {
}

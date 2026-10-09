package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.UserPlayHistory;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 用户收听历史 Mapper */
@Mapper
public interface UserPlayHistoryMapper extends BaseMapper<UserPlayHistory> {

    /** 唯一键 upsert：重复播放时更新次数与最近播放时间 */
    @Insert("INSERT INTO user_play_history (id, user_id, song_id, play_count, last_played_at, create_time, update_time) " +
            "VALUES (#{id}, #{userId}, #{songId}, 1, NOW(), NOW(), NOW()) " +
            "ON DUPLICATE KEY UPDATE play_count = play_count + 1, last_played_at = NOW(), update_time = NOW()")
    int upsert(@Param("id") Long id, @Param("userId") Long userId, @Param("songId") Long songId);
}

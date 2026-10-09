package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.musicholo.entity.MusicReviewLike;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MusicReviewLikeMapper extends BaseMapper<MusicReviewLike> {

    /** Idempotent insert; the unique (review_id, user_id) key resolves concurrent likes safely. */
    @Insert("INSERT IGNORE INTO music_review_like (id, review_id, user_id, create_time) " +
            "VALUES (#{id}, #{reviewId}, #{userId}, CURRENT_TIMESTAMP)")
    int insertIgnore(@Param("id") Long id,
                     @Param("reviewId") Long reviewId,
                     @Param("userId") Long userId);
}

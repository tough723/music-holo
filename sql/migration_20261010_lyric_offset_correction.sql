-- 歌词时间轴校正（众包）：用户把自己的校准结果报上来，达标后作为该曲的默认值下发。
-- 只记录偏移毫秒数，不保存歌词内容，也不改曲库里的歌词原文。
CREATE TABLE IF NOT EXISTS `lyric_offset_correction` (
  `id`          BIGINT   NOT NULL COMMENT '主键',
  `user_id`     BIGINT   NOT NULL COMMENT '提交账号',
  `song_id`     BIGINT   NOT NULL COMMENT '歌曲 id',
  `offset_ms`   INT      NOT NULL DEFAULT 0 COMMENT '偏移毫秒，正值＝歌词提前出现',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  `update_time` DATETIME DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song_offset` (`user_id`, `song_id`),
  KEY `idx_song_offset` (`song_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌词时间轴校正上报';

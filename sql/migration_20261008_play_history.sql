-- 为已部署数据库增量创建最近播放历史表（幂等）
-- 新安装已由 music_holo.sql 建表，无需重复执行。
CREATE TABLE IF NOT EXISTS `user_play_history` (
  `id`              BIGINT   NOT NULL,
  `user_id`         BIGINT   NOT NULL,
  `song_id`         BIGINT   NOT NULL,
  `play_count`      INT      NOT NULL DEFAULT 1,
  `last_played_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `create_time`     DATETIME DEFAULT NULL,
  `update_time`     DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song_history` (`user_id`, `song_id`),
  KEY `idx_user_last_played` (`user_id`, `last_played_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户最近播放历史';

-- 为已部署数据库增量创建不喜欢规则表（幂等）
-- 新安装已由 music_holo.sql 建表，无需重复执行。
-- 规则按账号隔离，只影响自动切歌和推荐，不删除曲库。
CREATE TABLE IF NOT EXISTS `user_song_dislike` (
  `id`          BIGINT   NOT NULL COMMENT '主键',
  `user_id`     BIGINT   NOT NULL COMMENT '用户 id',
  `song_id`     BIGINT   NOT NULL COMMENT '歌曲 id',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song_dislike` (`user_id`, `song_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户不喜欢的歌曲';

CREATE TABLE IF NOT EXISTS `user_singer_dislike` (
  `id`          BIGINT   NOT NULL COMMENT '主键',
  `user_id`     BIGINT   NOT NULL COMMENT '用户 id',
  `singer_id`   BIGINT   NOT NULL COMMENT '歌手 id',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_singer_dislike` (`user_id`, `singer_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户不喜欢的歌手';

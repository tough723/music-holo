-- 收听统计（P2-8）：客户端批量上报的播放/跳过/播完/错误事件。
-- 保留期 90 天，清理 SQL：DELETE FROM user_stat_event WHERE occurred_at < DATE_SUB(NOW(), INTERVAL 90 DAY);（自动清理任务未实现）
-- 新安装数据库已由 sql/music_holo.sql 创建本表，重复执行无副作用。
CREATE TABLE IF NOT EXISTS `user_stat_event` (
  `id`           BIGINT      NOT NULL                COMMENT '主键',
  `user_id`      BIGINT      NOT NULL                COMMENT '上报账号',
  `event_id`     VARCHAR(64) NOT NULL                COMMENT '客户端生成的幂等键',
  `event_type`   VARCHAR(16) NOT NULL                COMMENT 'play / skip / complete / error',
  `song_id`      BIGINT      DEFAULT NULL            COMMENT '歌曲 id，可为空',
  `duration_sec` INT         DEFAULT NULL            COMMENT '曲目时长（秒），0..3600',
  `position_sec` INT         DEFAULT NULL            COMMENT '事件发生时的播放位置（秒）',
  `seconds`      INT         NOT NULL DEFAULT 0      COMMENT '折算收听时长（秒）',
  `occurred_at`  DATETIME    NOT NULL                COMMENT '事件发生时间（客户端时间）',
  `create_time`  DATETIME    DEFAULT NULL            COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_event` (`user_id`, `event_id`),
  KEY `idx_user_time` (`user_id`, `occurred_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户收听事件';

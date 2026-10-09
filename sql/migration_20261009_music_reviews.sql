-- 歌曲/歌单短评及审核增量迁移（幂等）
-- 新安装数据库已由 sql/music_holo.sql 创建这些表，无需重复执行。

CREATE TABLE IF NOT EXISTS `music_review` (
  `id`              BIGINT        NOT NULL,
  `target_type`     VARCHAR(16)   NOT NULL COMMENT '目标类型：song / playlist',
  `target_id`       BIGINT        NOT NULL COMMENT '歌曲或歌单 id',
  `user_id`         BIGINT        NOT NULL COMMENT '作者用户 id',
  `content`         VARCHAR(500)  NOT NULL COMMENT '短评内容（最多 500 字）',
  `like_count`      INT           NOT NULL DEFAULT 0 COMMENT '点赞数',
  `status`          TINYINT       NOT NULL DEFAULT 1 COMMENT '0 隐藏，1 公开，2 作者已删除',
  `moderation_note` VARCHAR(300)  DEFAULT NULL COMMENT '管理员给作者的审核说明',
  `create_time`     DATETIME      DEFAULT NULL,
  `update_time`     DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_review_target_status_time` (`target_type`, `target_id`, `status`, `create_time`),
  KEY `idx_review_author_time` (`user_id`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌曲与歌单短评';

CREATE TABLE IF NOT EXISTS `music_review_like` (
  `id`          BIGINT   NOT NULL,
  `review_id`   BIGINT   NOT NULL COMMENT '短评 id',
  `user_id`     BIGINT   NOT NULL COMMENT '点赞用户 id',
  `create_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_like_user` (`review_id`, `user_id`),
  KEY `idx_review_like_user` (`user_id`, `review_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '短评点赞';

CREATE TABLE IF NOT EXISTS `music_review_report` (
  `id`          BIGINT       NOT NULL,
  `review_id`   BIGINT       NOT NULL COMMENT '被举报短评 id',
  `reporter_id` BIGINT       NOT NULL COMMENT '举报用户 id',
  `reason`      VARCHAR(24)  NOT NULL COMMENT 'spam / abuse / copyright / other',
  `details`     VARCHAR(300) DEFAULT NULL COMMENT '举报补充说明',
  `status`      TINYINT      NOT NULL DEFAULT 0 COMMENT '0 待处理，1 已隐藏并处理，2 已驳回',
  `action`      VARCHAR(16)  DEFAULT NULL COMMENT 'hide / dismiss',
  `handled_by`  BIGINT       DEFAULT NULL COMMENT '处理管理员 id',
  `admin_note`  VARCHAR(300) DEFAULT NULL COMMENT '管理员处理备注',
  `handled_at`  DATETIME     DEFAULT NULL,
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_report_user` (`review_id`, `reporter_id`),
  KEY `idx_review_report_queue` (`status`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '短评举报与审核记录';

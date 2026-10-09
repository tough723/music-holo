-- ============================================================
-- 3D全息投影音乐播放平台（music-holo）数据库初始化脚本
-- 数据库：MySQL 8.x，字符集 utf8mb4
-- ============================================================

CREATE DATABASE IF NOT EXISTS `music_holo` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE `music_holo`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. 系统用户表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
  `id`          BIGINT       NOT NULL                COMMENT '主键（雪花 id）',
  `username`    VARCHAR(50)  NOT NULL                COMMENT '登录账号',
  `password`    VARCHAR(100) NOT NULL                COMMENT '密码（BCrypt 加密）',
  `nickname`    VARCHAR(50)  DEFAULT NULL            COMMENT '昵称',
  `avatar`      VARCHAR(255) DEFAULT NULL            COMMENT '头像地址',
  `email`       VARCHAR(100) DEFAULT NULL            COMMENT '邮箱',
  `phone`       VARCHAR(20)  DEFAULT NULL            COMMENT '手机号',
  `gender`      TINYINT      DEFAULT 0               COMMENT '性别：0未知 1男 2女',
  `role`        TINYINT      DEFAULT 1               COMMENT '角色：0管理员 1普通用户',
  `theme`       VARCHAR(20)  DEFAULT 'cyan'          COMMENT '个性化主题：cyan/magenta/amber/lime/ruby',
  `status`      TINYINT      DEFAULT 1               COMMENT '状态：0禁用 1正常',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除：0未删除 1已删除',
  `create_time` DATETIME     DEFAULT NULL            COMMENT '创建时间',
  `update_time` DATETIME     DEFAULT NULL            COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '系统用户表';

-- ------------------------------------------------------------
-- 2. 歌手表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `singer`;
CREATE TABLE `singer` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `name`        VARCHAR(100) NOT NULL                COMMENT '歌手名称',
  `gender`      TINYINT      DEFAULT 0               COMMENT '性别：0未知 1男 2女',
  `region`      VARCHAR(50)  DEFAULT NULL            COMMENT '地区',
  `intro`       VARCHAR(500) DEFAULT NULL            COMMENT '简介',
  `avatar`      VARCHAR(255) DEFAULT NULL            COMMENT '头像地址',
  `sort`        INT          DEFAULT 0               COMMENT '排序号',
  `status`      TINYINT      DEFAULT 1               COMMENT '状态：0下架 1正常',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌手表';

-- ------------------------------------------------------------
-- 3. 歌曲分类表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `song_category`;
CREATE TABLE `song_category` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `name`        VARCHAR(50)  NOT NULL                COMMENT '分类名称',
  `parent_id`   BIGINT       DEFAULT 0               COMMENT '父级分类 id，0 表示顶级',
  `sort`        INT          DEFAULT 0               COMMENT '排序号',
  `status`      TINYINT      DEFAULT 1               COMMENT '状态：0禁用 1正常',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌曲分类表';

-- ------------------------------------------------------------
-- 4. 歌曲表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `song`;
CREATE TABLE `song` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `title`       VARCHAR(200) NOT NULL                COMMENT '歌曲标题',
  `singer_id`   BIGINT       DEFAULT NULL            COMMENT '歌手 id',
  `category_id` BIGINT       DEFAULT NULL            COMMENT '分类 id',
  `album`       VARCHAR(200) DEFAULT NULL            COMMENT '专辑名',
  `duration`    INT          DEFAULT 0               COMMENT '时长（秒）',
  `cover`       VARCHAR(255) DEFAULT NULL            COMMENT '封面地址',
  `audio_url`   VARCHAR(500) DEFAULT NULL            COMMENT '音频地址',
  `lyric`       TEXT                                 COMMENT '原歌词内容（LRC 格式）',
  `lyric_translation` TEXT                           COMMENT '译文歌词内容（LRC 格式）',
  `status`      TINYINT      DEFAULT 1               COMMENT '状态：0下架 1正常',
  `play_count`  BIGINT       DEFAULT 0               COMMENT '播放量',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_singer_id` (`singer_id`),
  KEY `idx_category_id` (`category_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌曲表';

-- ------------------------------------------------------------
-- 5. 歌单表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `playlist`;
CREATE TABLE `playlist` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `name`        VARCHAR(100) NOT NULL                COMMENT '歌单名称',
  `cover`       VARCHAR(255) DEFAULT NULL            COMMENT '封面地址',
  `description` VARCHAR(500) DEFAULT NULL            COMMENT '描述',
  `creator_id`  BIGINT       DEFAULT NULL            COMMENT '创建者用户 id',
  `is_public`   TINYINT      DEFAULT 1               COMMENT '是否公开：0私密 1公开',
  `play_count`  BIGINT       DEFAULT 0               COMMENT '播放量',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_creator_id` (`creator_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌单表';

-- ------------------------------------------------------------
-- 6. 歌单-歌曲关联表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `playlist_song`;
CREATE TABLE `playlist_song` (
  `id`          BIGINT   NOT NULL                    COMMENT '主键',
  `playlist_id` BIGINT   NOT NULL                    COMMENT '歌单 id',
  `song_id`     BIGINT   NOT NULL                    COMMENT '歌曲 id',
  `sort`        INT      DEFAULT 0                   COMMENT '在歌单中的排序',
  `create_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_playlist_id` (`playlist_id`),
  KEY `idx_song_id` (`song_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '歌单-歌曲关联表';

-- ------------------------------------------------------------
-- 7. 用户收藏表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `user_favorite`;
CREATE TABLE `user_favorite` (
  `id`          BIGINT   NOT NULL                    COMMENT '主键',
  `user_id`     BIGINT   NOT NULL                    COMMENT '用户 id',
  `song_id`     BIGINT   NOT NULL                    COMMENT '歌曲 id',
  `create_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song` (`user_id`, `song_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户歌曲收藏表';

-- ------------------------------------------------------------
-- 8. 用户最近播放表（按用户/歌曲聚合，保留最后播放时间与次数）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `user_play_history`;
CREATE TABLE `user_play_history` (
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

-- ------------------------------------------------------------
-- 用户不喜欢的歌曲 / 歌手（账号隔离，可撤销，不删除曲库）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `user_song_dislike`;
CREATE TABLE `user_song_dislike` (
  `id`          BIGINT   NOT NULL COMMENT '主键',
  `user_id`     BIGINT   NOT NULL COMMENT '用户 id',
  `song_id`     BIGINT   NOT NULL COMMENT '歌曲 id',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_song_dislike` (`user_id`, `song_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户不喜欢的歌曲';

DROP TABLE IF EXISTS `user_singer_dislike`;
CREATE TABLE `user_singer_dislike` (
  `id`          BIGINT   NOT NULL COMMENT '主键',
  `user_id`     BIGINT   NOT NULL COMMENT '用户 id',
  `singer_id`   BIGINT   NOT NULL COMMENT '歌手 id',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_singer_dislike` (`user_id`, `singer_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户不喜欢的歌手';

-- ------------------------------------------------------------
-- 9. 歌曲与歌单短评、点赞和举报审核
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `music_review_report`;
CREATE TABLE `music_review_report` (
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

DROP TABLE IF EXISTS `music_review_like`;
CREATE TABLE `music_review_like` (
  `id`          BIGINT   NOT NULL,
  `review_id`   BIGINT   NOT NULL COMMENT '短评 id',
  `user_id`     BIGINT   NOT NULL COMMENT '点赞用户 id',
  `create_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_like_user` (`review_id`, `user_id`),
  KEY `idx_review_like_user` (`user_id`, `review_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '短评点赞';

DROP TABLE IF EXISTS `music_review`;
CREATE TABLE `music_review` (
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

-- ------------------------------------------------------------
-- 12. 系统参数配置表
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_config`;
CREATE TABLE `sys_config` (
  `id`           BIGINT       NOT NULL                COMMENT '主键',
  `config_key`   VARCHAR(100) NOT NULL                COMMENT '配置键（唯一）',
  `config_value` VARCHAR(500) DEFAULT NULL            COMMENT '配置值',
  `config_name`  VARCHAR(100) DEFAULT NULL            COMMENT '配置名称',
  `remark`       VARCHAR(255) DEFAULT NULL            COMMENT '备注',
  `create_time`  DATETIME     DEFAULT NULL,
  `update_time`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '系统参数配置表';

-- ------------------------------------------------------------
-- 13. 字典类型表（代码表）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_dict`;
CREATE TABLE `sys_dict` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `dict_name`   VARCHAR(100) DEFAULT NULL            COMMENT '字典名称',
  `dict_type`   VARCHAR(100) NOT NULL                COMMENT '字典类型（唯一）',
  `remark`      VARCHAR(255) DEFAULT NULL            COMMENT '备注',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  `update_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dict_type` (`dict_type`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '字典类型表';

-- ------------------------------------------------------------
-- 14. 字典数据表（代码表内容）
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sys_dict_data`;
CREATE TABLE `sys_dict_data` (
  `id`          BIGINT       NOT NULL                COMMENT '主键',
  `dict_type`   VARCHAR(100) NOT NULL                COMMENT '字典类型',
  `dict_label`  VARCHAR(100) NOT NULL                COMMENT '字典标签（显示值）',
  `dict_value`  VARCHAR(100) NOT NULL                COMMENT '字典键值（实际值）',
  `sort`        INT          DEFAULT 0               COMMENT '排序号',
  `status`      TINYINT      DEFAULT 1               COMMENT '状态：0禁用 1正常',
  `deleted`     TINYINT      DEFAULT 0               COMMENT '逻辑删除',
  `create_time` DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dict_type` (`dict_type`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '字典数据表';

-- ============================================================
-- 初始化数据
-- 说明：内置账号 admin / 123456（管理员）、demo / 123456（普通用户）
-- 密码为 BCrypt 密文（$2a$ 前缀，与 Hutool BCrypt 兼容）
-- ============================================================

-- 用户
INSERT INTO `sys_user` (`id`, `username`, `password`, `nickname`, `gender`, `role`, `theme`, `status`, `create_time`, `update_time`) VALUES
(1, 'admin', '$2a$10$.gTt2B5wls7mM5rM72gCWenP.NWmbhqGNxUDhsaUGc79r8f.MtLBK', '全息管理员', 1, 0, 'cyan', 1, NOW(), NOW()),
(2, 'demo',  '$2a$10$.gTt2B5wls7mM5rM72gCWenP.NWmbhqGNxUDhsaUGc79r8f.MtLBK', '演示用户',   2, 1, 'magenta', 1, NOW(), NOW());

-- 歌手
INSERT INTO `singer` (`id`, `name`, `gender`, `region`, `intro`, `sort`, `status`, `create_time`, `update_time`) VALUES
(1, '林澈',   1, '内地', '嗓音清澈如海风，擅长把情绪唱进霓虹夜色里。', 1, 1, NOW(), NOW()),
(2, '苏晚',   2, '港台', '深夜电台的声音，故事感与空气感并存。',         2, 1, NOW(), NOW()),
(3, 'KAIN',   1, '欧美', '电子音乐制作人，擅长用合成器搭建赛博空间。',   3, 1, NOW(), NOW()),
(4, '周屿舟', 1, '内地', '独立摇滚厂牌主理人，吉他与呐喊是他的语言。',     4, 1, NOW(), NOW()),
(5, '陆呼吸', 2, '内地', '民谣创作者，歌词像日记一样温柔锋利。',           5, 1, NOW(), NOW()),
(6, 'DJ Nova',1, '日韩', '专注深空浩室与未来贝斯的电音玩家。',             6, 1, NOW(), NOW());

-- 歌曲分类
INSERT INTO `song_category` (`id`, `name`, `parent_id`, `sort`, `status`, `create_time`, `update_time`) VALUES
(1, '华语',     0, 1, 1, NOW(), NOW()),
(2, '欧美',     0, 2, 1, NOW(), NOW()),
(3, '日韩',     0, 3, 1, NOW(), NOW()),
(4, '电子',     0, 4, 1, NOW(), NOW()),
(5, '摇滚',     0, 5, 1, NOW(), NOW()),
(6, '民谣',     0, 6, 1, NOW(), NOW()),
(7, '古风',     0, 7, 1, NOW(), NOW()),
(8, '影视金曲', 0, 8, 1, NOW(), NOW());

-- 歌曲（音频为前端 public 目录下的演示音频，时长 10 秒）
INSERT INTO `song` (`id`, `title`, `singer_id`, `category_id`, `album`, `duration`, `audio_url`, `lyric`, `status`, `play_count`, `create_time`, `update_time`) VALUES
(1, '霓虹海', 1, 1, '《霓虹海》', 10, '/audio/song1.wav',
'[00:00.50]霓虹亮起 城市开始呼吸
[00:02.00]海风把心事 一并带走
[00:03.50]我在全息投影里 想你
[00:05.00]投影摇晃 像思念的形状
[00:06.50]等信号亮起 说一句 hello
[00:08.00]下一站 是温柔的宇宙', 1, 12580, NOW(), NOW()),
(2, '云端信使', 2, 1, '《云端信使》', 10, '/audio/song2.wav',
'[00:00.50]云朵寄来 一封旧时信
[00:02.00]邮戳盖着 去年的风景
[00:03.50]信使飞过 北纬三十五度
[00:05.00]把你的名字 念成一颗星
[00:06.50]星星亮了 邮件就到了
[00:08.00]打开一看 是山河万程', 1, 9860, NOW(), NOW()),
(3, '全息之恋', 1, 7, '《全息之恋》', 10, '/audio/song3.wav',
'[00:00.50]青衫白马 谁在谁身旁
[00:02.00]一帘幽梦 全息的光
[00:03.50]你在投影里 我在投影外
[00:05.00]伸手却握不住 一场春梦
[00:06.50]琴声起 处处是故乡
[00:08.00]醒来时 月色正微凉', 1, 7640, NOW(), NOW()),
(4, '极光列车', 3, 4, '《极光列车》', 10, '/audio/song4.wav',
'[00:00.50]午夜列车 穿过极光
[00:02.00]每个窗口 都是一扇梦
[00:03.50]下一站停靠 你的城
[00:05.00]汽笛声里 藏着心动
[00:06.50]列车员说 请系好安全带
[00:08.00]我们即将抵达 温柔', 1, 15320, NOW(), NOW()),
(5, '玻璃糖纸', 5, 6, '《玻璃糖纸》', 10, '/audio/song5.wav',
'[00:00.50]糖纸折成 千纸鹤飞走
[00:02.00]风一吹 透明的温柔
[00:03.50]咬一口是 薄荷的凉
[00:05.00]甜味里有 你的问候
[00:06.50]夏天快结束 歌声慢下来
[00:08.00]蝉鸣声里 说声再见', 1, 5420, NOW(), NOW()),
(6, '深空回响', 6, 4, '《深空回响》', 10, '/audio/song6.wav',
'[00:00.50]深空回响 电波的诗
[00:02.00]飞过土星 光环的影子
[00:03.50]外星的频率 陌生又熟悉
[00:05.00]像你昨夜 的一句梦呓
[00:06.50]信号断断 续续不停
[00:08.00]宇宙很大 我只听你', 1, 11050, NOW(), NOW()),
(7, '旧城之光', 4, 5, '《旧城之光》', 10, '/audio/song7.wav',
'[00:00.50]旧城的灯 忽明忽暗
[00:02.00]吉他声里 时间走慢
[00:03.50]墙上的涂鸦 被雨冲淡
[00:05.00]故事讲到一半 天就亮了
[00:06.50]保安大叔 说该回家了
[00:08.00]明天的太阳 照常升起', 1, 8730, NOW(), NOW()),
(8, '幻境漫游', 2, 8, '《幻境漫游》', 10, '/audio/song8.wav',
'[00:00.50]戴上耳机 世界换了频道
[00:02.00]全息投影 演一场独角戏
[00:03.50]我在光里 你也在光里
[00:05.00]音乐是通用的 语言
[00:06.50]闭上眼 就能看见你
[00:08.00]漫游到 梦的尽头', 1, 6210, NOW(), NOW());

-- 双语歌词演示：译文时间标签与原歌词对应，便于演示播放器的同步开关。
UPDATE `song` SET `lyric_translation` =
'[00:00.50]Neon wakes, the city starts to breathe
[00:02.00]The sea breeze carries every worry away
[00:03.50]Inside the hologram, I think of you
[00:05.00]The image sways like the shape of longing
[00:06.50]When the signal lights, I will say hello
[00:08.00]Our next stop is a gentle universe'
WHERE `id` = 1;

-- 歌单
INSERT INTO `playlist` (`id`, `name`, `description`, `creator_id`, `is_public`, `play_count`, `create_time`, `update_time`) VALUES
(1, '深夜霓虹', '凌晨两点的电台歌单，霓虹与海风的声音。', 1, 1, 3260, NOW(), NOW()),
(2, '全息舞台', '全息投影视觉系现场，古风与电子的碰撞。', 1, 1, 2180, NOW(), NOW()),
(3, '华语精选', '华语独立音乐人的深夜自留地。',           2, 1, 1540, NOW(), NOW());

-- 歌单-歌曲关联
INSERT INTO `playlist_song` (`id`, `playlist_id`, `song_id`, `sort`, `create_time`) VALUES
(1, 1, 1, 1, NOW()),
(2, 1, 2, 2, NOW()),
(3, 1, 4, 3, NOW()),
(4, 2, 3, 1, NOW()),
(5, 2, 6, 2, NOW()),
(6, 2, 8, 3, NOW()),
(7, 3, 1, 1, NOW()),
(8, 3, 2, 2, NOW()),
(9, 3, 7, 3, NOW());

-- 收藏（演示用户收藏了 1 / 4 / 6 三首歌）
INSERT INTO `user_favorite` (`id`, `user_id`, `song_id`, `create_time`) VALUES
(1, 2, 1, NOW()),
(2, 2, 4, NOW()),
(3, 2, 6, NOW());

-- 最近播放（演示用户最近听过 6 / 4 / 1，登录后可继续收听）
INSERT INTO `user_play_history` (`id`, `user_id`, `song_id`, `play_count`, `last_played_at`, `create_time`, `update_time`) VALUES
(1, 2, 6, 9, DATE_SUB(NOW(), INTERVAL 10 MINUTE), NOW(), NOW()),
(2, 2, 4, 4, DATE_SUB(NOW(), INTERVAL 35 MINUTE), NOW(), NOW()),
(3, 2, 1, 12, DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), NOW());

-- 系统参数
INSERT INTO `sys_config` (`id`, `config_key`, `config_value`, `config_name`, `remark`, `create_time`, `update_time`) VALUES
(1, 'theme',     'cyan',  '全局默认主题', '平台全局默认主题，可选 cyan/magenta/amber/lime/ruby', NOW(), NOW()),
(2, 'site_name', '3D全息音乐', '站点名称', '平台名称', NOW(), NOW());

-- 字典类型
INSERT INTO `sys_dict` (`id`, `dict_name`, `dict_type`, `remark`, `create_time`, `update_time`) VALUES
(1, '性别',   'gender',      '用户 / 歌手性别代码表', NOW(), NOW()),
(2, '用户状态', 'user_status', '用户账号状态代码表',     NOW(), NOW()),
(3, '是否',   'yes_no',      '通用是否代码表',         NOW(), NOW());

-- 字典数据
INSERT INTO `sys_dict_data` (`id`, `dict_type`, `dict_label`, `dict_value`, `sort`, `status`, `create_time`) VALUES
(1,  'gender',      '保密', '0', 1, 1, NOW()),
(2,  'gender',      '男',   '1', 2, 1, NOW()),
(3,  'gender',      '女',   '2', 3, 1, NOW()),
(4,  'user_status', '禁用', '0', 1, 1, NOW()),
(5,  'user_status', '正常', '1', 2, 1, NOW()),
(6,  'yes_no',      '否',   '0', 1, 1, NOW()),
(7,  'yes_no',      '是',   '1', 2, 1, NOW());

SET FOREIGN_KEY_CHECKS = 1;

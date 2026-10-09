-- 用户导入的罗马音歌词增量迁移（MySQL 8.0；可重复执行）
-- 新建数据库已在 music_holo.sql 中包含此列；旧数据库执行本迁移补列。
SET @lyric_romaji_column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'song'
    AND COLUMN_NAME = 'lyric_romaji'
);
SET @lyric_romaji_ddl = IF(
  @lyric_romaji_column_exists = 0,
  'ALTER TABLE `song` ADD COLUMN `lyric_romaji` TEXT NULL COMMENT ''罗马音歌词内容（LRC 格式，仅用户导入）'' AFTER `lyric_translation`',
  'SELECT 1'
);
PREPARE lyric_romaji_stmt FROM @lyric_romaji_ddl;
EXECUTE lyric_romaji_stmt;
DEALLOCATE PREPARE lyric_romaji_stmt;

UPDATE `song` SET `lyric_romaji` =
'[00:00.50]Ni hong liang qi, cheng shi kai shi hu xi
[00:02.00]Hai feng ba xin shi yi bing dai zou
[00:03.50]Wo zai quan xi tou ying li xiang ni
[00:05.00]Tou ying yao huang, xiang si nian de xing zhuang
[00:06.50]Deng xin hao liang qi, shuo yi ju hello
[00:08.00]Xia yi zhan shi wen rou de yu zhou'
WHERE `id` = 1 AND (`lyric_romaji` IS NULL OR `lyric_romaji` = '');

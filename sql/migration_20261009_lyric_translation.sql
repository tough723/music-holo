-- 双语歌词译文增量迁移（MySQL 8.0；可重复执行）
-- 新建数据库已在 music_holo.sql 中包含此列；旧数据库执行本迁移补列。
SET @lyric_translation_column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'song'
    AND COLUMN_NAME = 'lyric_translation'
);
SET @lyric_translation_ddl = IF(
  @lyric_translation_column_exists = 0,
  'ALTER TABLE `song` ADD COLUMN `lyric_translation` TEXT NULL COMMENT ''译文歌词内容（LRC 格式）'' AFTER `lyric`',
  'SELECT 1'
);
PREPARE lyric_translation_stmt FROM @lyric_translation_ddl;
EXECUTE lyric_translation_stmt;
DEALLOCATE PREPARE lyric_translation_stmt;

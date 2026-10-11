-- 歌曲响度元数据（P2-10）增量迁移（MySQL 8.0；可重复执行）
-- 音频预扫描任务尚未实现，因此本列在上线时恒为 NULL，仅先把字段与接口约定固化下来。
-- 新建数据库已在 music_holo.sql 中包含此列；旧数据库执行本迁移补列。
SET @song_loudness_column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'song'
    AND COLUMN_NAME = 'loudness'
);
SET @song_loudness_ddl = IF(
  @song_loudness_column_exists = 0,
  'ALTER TABLE `song` ADD COLUMN `loudness` DECIMAL(6,2) NULL COMMENT ''LUFS 实测响度（预扫描未实现前恒为 NULL）'' AFTER `play_count`',
  'SELECT 1'
);
PREPARE song_loudness_stmt FROM @song_loudness_ddl;
EXECUTE song_loudness_stmt;
DEALLOCATE PREPARE song_loudness_stmt;

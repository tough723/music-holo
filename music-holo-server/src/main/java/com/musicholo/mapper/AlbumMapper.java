package com.musicholo.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.vo.AlbumVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 专辑视图从歌曲表聚合生成；专辑名与歌手共同构成稳定的查询键。 */
@Mapper
public interface AlbumMapper {

    @Select("""
            <script>
            SELECT
                s.album AS album,
                s.singer_id AS singerId,
                COALESCE(MAX(si.name), '未知歌手') AS singerName,
                COALESCE(NULLIF(MAX(s.cover), ''), MAX(si.avatar), '') AS cover,
                COUNT(*) AS songCount,
                COALESCE(SUM(s.play_count), 0) AS playCount,
                MAX(s.create_time) AS latestSongTime
            FROM song s
            LEFT JOIN singer si ON si.id = s.singer_id AND si.deleted = 0 AND si.status = 1
            WHERE s.deleted = 0
              AND s.status = 1
              AND s.album IS NOT NULL
              AND TRIM(s.album) &lt;&gt; ''
            <if test="keyword != null and keyword != ''">
              AND (s.album LIKE CONCAT('%', #{keyword}, '%') OR si.name LIKE CONCAT('%', #{keyword}, '%'))
            </if>
            GROUP BY s.album, s.singer_id
            ORDER BY playCount DESC, s.album ASC, singerName ASC
            </script>
            """)
    IPage<AlbumVO> selectAlbumPage(Page<AlbumVO> page, @Param("keyword") String keyword);

    @Select("""
            <script>
            SELECT
                s.album AS album,
                s.singer_id AS singerId,
                COALESCE(MAX(si.name), '未知歌手') AS singerName,
                COALESCE(NULLIF(MAX(s.cover), ''), MAX(si.avatar), '') AS cover,
                COUNT(*) AS songCount,
                COALESCE(SUM(s.play_count), 0) AS playCount,
                MAX(s.create_time) AS latestSongTime
            FROM song s
            LEFT JOIN singer si ON si.id = s.singer_id AND si.deleted = 0 AND si.status = 1
            WHERE s.deleted = 0
              AND s.status = 1
              AND s.album = #{album}
            <if test="singerId != null">
              AND s.singer_id = #{singerId}
            </if>
            GROUP BY s.album, s.singer_id
            LIMIT 1
            </script>
            """)
    AlbumVO selectAlbum(@Param("album") String album, @Param("singerId") Long singerId);
}

package com.musicholo.service;

import cn.hutool.core.io.FileUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.Singer;
import com.musicholo.entity.Song;
import com.musicholo.entity.SongCategory;
import com.musicholo.entity.SysDictData;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongCategoryMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.SysDictDataMapper;
import com.musicholo.mapper.SysUserMapper;
import com.musicholo.util.FileStorageUtil;
import com.musicholo.vo.DictVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 公共服务：代码表（字典）查询、文件上传下载、平台统计
 */
@Service
@RequiredArgsConstructor
public class CommonService {

    private final SysDictDataMapper dictDataMapper;
    private final SysUserMapper sysUserMapper;
    private final SingerMapper singerMapper;
    private final SongMapper songMapper;
    private final PlaylistMapper playlistMapper;
    private final SongCategoryMapper categoryMapper;
    private final FileStorageUtil fileStorageUtil;

    /**
     * 按字典类型查询代码表
     */
    public List<DictVO> dictByType(String dictType) {
        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getDictType, dictType)
                .eq(SysDictData::getStatus, 1)
                .orderByAsc(SysDictData::getSort)
                .orderByAsc(SysDictData::getId));
        return list.stream()
                .map(d -> new DictVO(d.getDictLabel(), d.getDictValue()))
                .collect(Collectors.toList());
    }

    /**
     * 全部代码表（按类型分组）
     */
    public Map<String, List<DictVO>> dictAll() {
        List<SysDictData> list = dictDataMapper.selectList(new LambdaQueryWrapper<SysDictData>()
                .eq(SysDictData::getStatus, 1)
                .orderByAsc(SysDictData::getDictType)
                .orderByAsc(SysDictData::getSort)
                .orderByAsc(SysDictData::getId));
        return list.stream().collect(Collectors.groupingBy(
                SysDictData::getDictType,
                Collectors.mapping(d -> new DictVO(d.getDictLabel(), d.getDictValue()), Collectors.toList())));
    }

    /**
     * 文件上传，返回可访问地址
     */
    public Map<String, Object> upload(MultipartFile file) {
        String url = fileStorageUtil.store(file);
        Map<String, Object> result = new HashMap<>();
        result.put("url", url);
        result.put("name", file.getOriginalFilename());
        result.put("size", file.getSize());
        return result;
    }

    /**
     * 文件下载（从上传目录按文件名下载）
     */
    public void download(String fileName, HttpServletResponse response) throws IOException {
        File file = fileStorageUtil.getFile(fileName);
        if (file == null) {
            throw new BusinessException("文件不存在");
        }
        response.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        response.setHeader("Content-Disposition", "attachment;filename="
                + URLEncoder.encode(file.getName(), StandardCharsets.UTF_8));
        FileUtil.writeToStream(file, response.getOutputStream());
        response.getOutputStream().flush();
    }

    /**
     * 平台统计数据（仪表盘用）
     */
    public Map<String, Object> stats() {
        Map<String, Object> result = new HashMap<>();
        result.put("userCount", sysUserMapper.selectCount(null));
        result.put("singerCount", singerMapper.selectCount(null));
        result.put("songCount", songMapper.selectCount(null));
        result.put("playlistCount", playlistMapper.selectCount(null));

        // 累计播放量
        List<Map<String, Object>> playRows = songMapper.selectMaps(new QueryWrapper<Song>()
                .select("IFNULL(SUM(play_count), 0) AS total"));
        Object totalPlay = playRows.isEmpty() ? 0 : playRows.get(0).get("total");
        result.put("totalPlayCount", totalPlay);

        // 分类歌曲数量分布
        List<Map<String, Object>> categoryRows = songMapper.selectMaps(new QueryWrapper<Song>()
                .select("category_id AS categoryId", "COUNT(1) AS value")
                .groupBy("category_id"));
        Map<Long, String> categoryNames = categoryMapper.selectList(null).stream()
                .collect(Collectors.toMap(SongCategory::getId, SongCategory::getName));
        List<Map<String, Object>> categoryStats = new ArrayList<>();
        for (Map<String, Object> row : categoryRows) {
            Map<String, Object> item = new HashMap<>();
            item.put("name", categoryNames.getOrDefault(((Number) row.get("categoryId")).longValue(), "未知分类"));
            item.put("value", ((Number) row.get("value")).longValue());
            categoryStats.add(item);
        }
        categoryStats.sort((a, b) -> Long.compare((Long) b.get("value"), (Long) a.get("value")));
        result.put("categoryStats", categoryStats);

        // 歌手歌曲数量 Top10
        List<Map<String, Object>> singerRows = songMapper.selectMaps(new QueryWrapper<Song>()
                .select("singer_id AS singerId", "COUNT(1) AS value")
                .groupBy("singer_id"));
        Map<Long, String> singerNames = singerMapper.selectList(null).stream()
                .collect(Collectors.toMap(Singer::getId, Singer::getName));
        List<Map<String, Object>> singerStats = new ArrayList<>();
        for (Map<String, Object> row : singerRows) {
            Map<String, Object> item = new HashMap<>();
            item.put("name", singerNames.getOrDefault(((Number) row.get("singerId")).longValue(), "未知歌手"));
            item.put("value", ((Number) row.get("value")).longValue());
            singerStats.add(item);
        }
        singerStats.sort((a, b) -> Long.compare((Long) b.get("value"), (Long) a.get("value")));
        result.put("singerStats", singerStats.size() > 10 ? singerStats.subList(0, 10) : singerStats);

        // 歌手播放量分布
        List<Map<String, Object>> playStatsRows = songMapper.selectMaps(new QueryWrapper<Song>()
                .select("singer_id AS singerId", "IFNULL(SUM(play_count), 0) AS value")
                .groupBy("singer_id"));
        List<Map<String, Object>> playStats = new ArrayList<>();
        for (Map<String, Object> row : playStatsRows) {
            Map<String, Object> item = new HashMap<>();
            item.put("name", singerNames.getOrDefault(((Number) row.get("singerId")).longValue(), "未知歌手"));
            item.put("value", ((Number) row.get("value")).longValue());
            playStats.add(item);
        }
        playStats.sort((a, b) -> Long.compare((Long) b.get("value"), (Long) a.get("value")));
        result.put("playStats", playStats.size() > 10 ? playStats.subList(0, 10) : playStats);

        return result;
    }
}

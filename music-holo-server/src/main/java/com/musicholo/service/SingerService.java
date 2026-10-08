package com.musicholo.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.text.csv.CsvData;
import cn.hutool.core.text.csv.CsvReader;
import cn.hutool.core.text.csv.CsvReadConfig;
import cn.hutool.core.text.csv.CsvUtil;
import cn.hutool.core.text.csv.CsvWriter;
import cn.hutool.core.util.StrUtil;
import cn.hutool.core.date.DateUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.SingerQuery;
import com.musicholo.dto.SingerSaveDTO;
import com.musicholo.entity.Singer;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.SingerVO;
import com.musicholo.vo.SongVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 歌手服务：增删改查、歌手歌曲查询、CSV 导入导出
 */
@Service
@RequiredArgsConstructor
public class SingerService {

    private final SingerMapper singerMapper;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;

    /**
     * 歌手分页查询
     */
    public Page<SingerVO> page(SingerQuery query) {
        LambdaQueryWrapper<Singer> qw = new LambdaQueryWrapper<>();
        qw.like(StrUtil.isNotBlank(query.getKeyword()), Singer::getName, query.getKeyword());
        qw.eq(query.getGender() != null, Singer::getGender, query.getGender());
        qw.eq(StrUtil.isNotBlank(query.getRegion()), Singer::getRegion, query.getRegion());
        qw.orderByAsc(Singer::getSort).orderByDesc(Singer::getId);

        Page<Singer> page = singerMapper.selectPage(
                new Page<>(query.getPageNum(), query.getPageSize()), qw);

        // 统计每个歌手的歌曲数量
        List<Map<String, Object>> countRows = songMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Song>()
                        .select("singer_id AS singerId", "COUNT(1) AS cnt")
                        .groupBy("singer_id"));
        Map<Long, Long> songCountMap = new HashMap<>();
        for (Map<String, Object> row : countRows) {
            songCountMap.put(((Number) row.get("singerId")).longValue(),
                    ((Number) row.get("cnt")).longValue());
        }

        Page<SingerVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        List<SingerVO> records = new ArrayList<>();
        for (Singer singer : page.getRecords()) {
            SingerVO vo = BeanUtil.copyProperties(singer, SingerVO.class);
            vo.setSongCount(songCountMap.getOrDefault(singer.getId(), 0L));
            records.add(vo);
        }
        voPage.setRecords(records);
        return voPage;
    }

    /**
     * 歌手详情
     */
    public SingerVO detail(Long id) {
        Singer singer = getById(id);
        SingerVO vo = BeanUtil.copyProperties(singer, SingerVO.class);
        Long count = songMapper.selectCount(new LambdaQueryWrapper<Song>().eq(Song::getSingerId, id));
        vo.setSongCount(count == null ? 0L : count);
        return vo;
    }

    /**
     * 查询歌手的歌曲列表
     */
    public List<SongVO> songsOfSinger(Long singerId) {
        getById(singerId);
        List<Song> songs = songMapper.selectList(new LambdaQueryWrapper<Song>()
                .eq(Song::getSingerId, singerId)
                .orderByDesc(Song::getPlayCount)
                .orderByDesc(Song::getId));
        return songAssembler.toVOList(songs);
    }

    /**
     * 新增 / 修改歌手
     */
    public SingerVO save(SingerSaveDTO dto) {
        Singer singer = new Singer();
        if (dto.getId() != null) {
            singer = getById(dto.getId());
        }
        singer.setName(dto.getName());
        singer.setGender(dto.getGender() == null ? 0 : dto.getGender());
        singer.setRegion(dto.getRegion());
        singer.setIntro(dto.getIntro());
        singer.setAvatar(dto.getAvatar());
        singer.setSort(dto.getSort() == null ? 0 : dto.getSort());
        if (singer.getStatus() == null) {
            singer.setStatus(1);
        }
        if (dto.getId() == null) {
            singerMapper.insert(singer);
        } else {
            singerMapper.updateById(singer);
        }
        return BeanUtil.copyProperties(singer, SingerVO.class);
    }

    /**
     * 删除歌手
     */
    public void delete(Long id) {
        getById(id);
        Long songCount = songMapper.selectCount(new LambdaQueryWrapper<Song>().eq(Song::getSingerId, id));
        if (songCount != null && songCount > 0) {
            throw new BusinessException("该歌手下存在歌曲，无法删除");
        }
        singerMapper.deleteById(id);
    }

    /**
     * 导出歌手 CSV
     */
    public void export(HttpServletResponse response) throws IOException {
        List<Singer> list = singerMapper.selectList(new LambdaQueryWrapper<Singer>()
                .orderByAsc(Singer::getSort).orderByDesc(Singer::getId));
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment;filename="
                + URLEncoder.encode("singer_export_" + DateUtil.today() + ".csv", StandardCharsets.UTF_8));
        CsvWriter writer = CsvUtil.getWriter(response.getWriter());
        writer.writeLine(exportHeader());
        for (Singer s : list) {
            writer.writeLine(
                    String.valueOf(s.getId()),
                    nullToEmpty(s.getName()),
                    genderText(s.getGender()),
                    nullToEmpty(s.getRegion()),
                    nullToEmpty(s.getIntro()),
                    nullToEmpty(s.getAvatar()),
                    String.valueOf(s.getSort() == null ? 0 : s.getSort()));
        }
        writer.flush();
        writer.close();
    }

    /**
     * 下载导入模板
     */
    public void exportTemplate(HttpServletResponse response) throws IOException {
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment;filename="
                + URLEncoder.encode("singer_import_template.csv", StandardCharsets.UTF_8));
        CsvWriter writer = CsvUtil.getWriter(response.getWriter());
        writer.writeLine(exportHeader());
        writer.writeLine("1", "示例歌手", "男", "内地", "示例简介", "", "0");
        writer.flush();
        writer.close();
    }

    /**
     * 导入歌手 CSV，返回成功导入的条数
     */
    public int importCsv(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("上传文件不能为空");
        }
        CsvReadConfig config = CsvReadConfig.defaultConfig().setContainsHeader(true);
        CsvReader reader = CsvUtil.getReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8), config);
        CsvData data = reader.read();
        List<String> header = data.getHeader();
        List<List<String>> rows = data.getRows();
        if (header == null || header.isEmpty()) {
            throw new BusinessException("CSV 文件缺少表头");
        }
        Map<String, Integer> index = new HashMap<>();
        for (int i = 0; i < header.size(); i++) {
            index.put(header.get(i).trim(), i);
        }
        int count = 0;
        for (List<String> row : rows) {
            String name = cell(row, index, "歌手名称", "name");
            if (StrUtil.isBlank(name)) {
                continue;
            }
            Singer singer = new Singer();
            singer.setName(name);
            singer.setGender(parseGender(cell(row, index, "性别", "gender")));
            singer.setRegion(cell(row, index, "地区", "region"));
            singer.setIntro(cell(row, index, "简介", "intro"));
            singer.setAvatar(cell(row, index, "头像", "avatar"));
            String sort = cell(row, index, "排序", "sort");
            singer.setSort(StrUtil.isBlank(sort) ? 0 : Integer.parseInt(sort.trim()));
            singer.setStatus(1);
            singerMapper.insert(singer);
            count++;
        }
        return count;
    }

    private Singer getById(Long id) {
        Singer singer = singerMapper.selectById(id);
        if (singer == null) {
            throw new BusinessException("歌手不存在");
        }
        return singer;
    }

    private static String[] exportHeader() {
        return new String[]{"歌手ID", "歌手名称", "性别", "地区", "简介", "头像", "排序"};
    }

    private static String cell(List<String> row, Map<String, Integer> index, String... keys) {
        for (String key : keys) {
            Integer i = index.get(key);
            if (i != null && i < row.size()) {
                String value = row.get(i);
                if (StrUtil.isNotBlank(value)) {
                    return value.trim();
                }
            }
        }
        return "";
    }

    private static String genderText(Integer gender) {
        if (gender == null) {
            return "";
        }
        return switch (gender) {
            case 1 -> "男";
            case 2 -> "女";
            default -> "保密";
        };
    }

    private static int parseGender(String text) {
        if (StrUtil.isBlank(text)) {
            return 0;
        }
        return switch (text.trim()) {
            case "男", "male", "1" -> 1;
            case "女", "female", "2" -> 2;
            default -> 0;
        };
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}

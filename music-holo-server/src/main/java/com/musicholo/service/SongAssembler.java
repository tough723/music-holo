package com.musicholo.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.entity.Song;
import com.musicholo.entity.SongCategory;
import com.musicholo.entity.Singer;
import com.musicholo.mapper.SongCategoryMapper;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 歌曲 VO 组装器：批量填充歌手名 / 分类名，避免 N+1 查询
 */
@Component
@RequiredArgsConstructor
public class SongAssembler {

    private final SingerMapper singerMapper;
    private final SongCategoryMapper categoryMapper;

    public SongVO toVO(Song song) {
        if (song == null) {
            return null;
        }
        SongVO vo = toVOList(List.of(song)).get(0);
        vo.setLyric(song.getLyric());
        vo.setLyricTranslation(song.getLyricTranslation());
        vo.setLyricRomaji(song.getLyricRomaji());
        return vo;
    }

    public List<SongVO> toVOList(List<Song> songs) {
        List<SongVO> result = new ArrayList<>();
        if (songs == null || songs.isEmpty()) {
            return result;
        }
        Map<Long, String> singerNames = singerMapper.selectBatchIds(collectIds(songs, Song::getSingerId))
                .stream().collect(Collectors.toMap(Singer::getId, s -> s.getName() == null ? "" : s.getName()));
        Map<Long, String> categoryNames = categoryMapper.selectBatchIds(collectIds(songs, Song::getCategoryId))
                .stream().collect(Collectors.toMap(SongCategory::getId, c -> c.getName() == null ? "" : c.getName()));

        for (Song song : songs) {
            SongVO vo = new SongVO();
            vo.setId(song.getId());
            vo.setTitle(song.getTitle());
            vo.setSingerId(song.getSingerId());
            vo.setSingerName(singerNames.getOrDefault(song.getSingerId(), ""));
            vo.setCategoryId(song.getCategoryId());
            vo.setCategoryName(categoryNames.getOrDefault(song.getCategoryId(), ""));
            vo.setAlbum(song.getAlbum());
            vo.setDuration(song.getDuration());
            vo.setCover(song.getCover());
            vo.setAudioUrl(song.getAudioUrl());
            // List endpoints stay lightweight; detail() explicitly attaches both LRC texts.
            vo.setStatus(song.getStatus());
            vo.setPlayCount(song.getPlayCount());
            vo.setFavorite(false);
            vo.setCreateTime(song.getCreateTime());
            result.add(vo);
        }
        return result;
    }

    public Page<SongVO> toVOPage(Page<Song> page) {
        Page<SongVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        voPage.setRecords(toVOList(page.getRecords()));
        return voPage;
    }

    private List<Long> collectIds(List<Song> songs, Function<Song, Long> getter) {
        return songs.stream().map(getter).filter(id -> id != null && id > 0).distinct().collect(Collectors.toList());
    }
}

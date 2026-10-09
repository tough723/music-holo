package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserPlayHistory;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserPlayHistoryMapper;
import com.musicholo.vo.PlayHistoryVO;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** 用户最近播放历史：按用户/歌曲聚合保存播放次数与最近时间 */
@Service
@RequiredArgsConstructor
public class PlayHistoryService {

    private final UserPlayHistoryMapper historyMapper;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;

    public void record(Long userId, Long songId) {
        if (userId != null && songId != null) {
            historyMapper.upsert(IdWorker.getId(), userId, songId);
        }
    }

    public Page<PlayHistoryVO> page(Long userId, long pageNum, long pageSize) {
        long safePage = Math.max(1, pageNum);
        long safeSize = Math.max(1, Math.min(pageSize, 50));
        Page<UserPlayHistory> source = historyMapper.selectPage(
                new Page<>(safePage, safeSize),
                new LambdaQueryWrapper<UserPlayHistory>()
                        .eq(UserPlayHistory::getUserId, userId)
                        .orderByDesc(UserPlayHistory::getLastPlayedAt)
                        .orderByDesc(UserPlayHistory::getId));

        List<UserPlayHistory> validRows = new ArrayList<>();
        List<Song> orderedSongs = new ArrayList<>();
        if (!source.getRecords().isEmpty()) {
            List<Long> songIds = source.getRecords().stream()
                    .map(UserPlayHistory::getSongId).distinct().collect(Collectors.toList());
            Map<Long, Song> songById = new HashMap<>();
            for (Song song : songMapper.selectBatchIds(songIds)) {
                if (Integer.valueOf(1).equals(song.getStatus())) {
                    songById.put(song.getId(), song);
                }
            }
            for (UserPlayHistory row : source.getRecords()) {
                Song song = songById.get(row.getSongId());
                if (song != null) {
                    validRows.add(row);
                    orderedSongs.add(song);
                }
            }
        }

        List<SongVO> songVOs = songAssembler.toVOList(orderedSongs);
        List<PlayHistoryVO> records = new ArrayList<>();
        for (int i = 0; i < validRows.size(); i++) {
            PlayHistoryVO vo = new PlayHistoryVO();
            SongVO songVO = songVOs.get(i);
            vo.setId(songVO.getId());
            vo.setTitle(songVO.getTitle());
            vo.setSingerId(songVO.getSingerId());
            vo.setSingerName(songVO.getSingerName());
            vo.setCategoryId(songVO.getCategoryId());
            vo.setCategoryName(songVO.getCategoryName());
            vo.setAlbum(songVO.getAlbum());
            vo.setDuration(songVO.getDuration());
            vo.setCover(songVO.getCover());
            vo.setAudioUrl(songVO.getAudioUrl());
            vo.setStatus(songVO.getStatus());
            vo.setPlayCount(songVO.getPlayCount());
            vo.setFavorite(songVO.getFavorite());
            vo.setCreateTime(songVO.getCreateTime());
            vo.setPersonalPlayCount(validRows.get(i).getPlayCount());
            vo.setLastPlayedAt(validRows.get(i).getLastPlayedAt());
            records.add(vo);
        }
        Page<PlayHistoryVO> result = new Page<>(source.getCurrent(), source.getSize(), source.getTotal());
        result.setRecords(records);
        return result;
    }

    public void remove(Long userId, Long songId) {
        historyMapper.delete(new LambdaQueryWrapper<UserPlayHistory>()
                .eq(UserPlayHistory::getUserId, userId)
                .eq(UserPlayHistory::getSongId, songId));
    }

    public void clear(Long userId) {
        historyMapper.delete(new LambdaQueryWrapper<UserPlayHistory>()
                .eq(UserPlayHistory::getUserId, userId));
    }
}

package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.musicholo.common.Result;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.LyricOffsetSubmitDTO;
import com.musicholo.entity.LyricOffsetCorrection;
import com.musicholo.entity.Song;
import com.musicholo.mapper.LyricOffsetCorrectionMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.LyricOffsetVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * 歌词时间轴校正（众包）。
 *
 * 只保存“这首歌词整体偏早/偏晚多少毫秒”，不复制歌词内容、不改曲库原文。
 * 共识值取中位数：个别人的极端校准不会把默认值带跑偏；不足 MIN_REPORTS 份上报不下发。
 */
@Service
@RequiredArgsConstructor
public class LyricOffsetService {

    /** 偏移范围与前端时间校准一致（毫秒）。 */
    public static final int LIMIT_MS = 5000;
    /** 形成共识所需的最少上报数。 */
    public static final int MIN_REPORTS = 3;

    private final LyricOffsetCorrectionMapper correctionMapper;
    private final SongMapper songMapper;

    /** 查询一首歌的校正结果；未登录时只返回共识值。 */
    public LyricOffsetVO get(Long songId, Long userId) {
        LyricOffsetVO vo = new LyricOffsetVO();
        vo.setSongId(songId);
        vo.setMinReports(MIN_REPORTS);

        List<Integer> offsets = listOffsets(songId);
        vo.setCount(offsets.size());
        vo.setOffsetMs(consensus(offsets));

        if (userId != null) {
            LyricOffsetCorrection mine = getMine(songId, userId);
            vo.setMine(mine == null ? null : mine.getOffsetMs());
        }
        return vo;
    }

    /** 提交（覆盖）自己的校正；偏移为 0 表示归零而非撤回归档。 */
    @Transactional
    public LyricOffsetVO submit(Long userId, LyricOffsetSubmitDTO dto) {
        Long songId = dto.getSongId();
        requireSong(songId);
        int offsetMs = clamp(dto.getOffsetMs());

        LyricOffsetCorrection existing = getMine(songId, userId);
        if (existing == null) {
            LyricOffsetCorrection row = new LyricOffsetCorrection();
            row.setUserId(userId);
            row.setSongId(songId);
            row.setOffsetMs(offsetMs);
            correctionMapper.insert(row);
        } else if (!Objects.equals(existing.getOffsetMs(), offsetMs)) {
            LyricOffsetCorrection patch = new LyricOffsetCorrection();
            patch.setId(existing.getId());
            patch.setOffsetMs(offsetMs);
            correctionMapper.updateById(patch);
        }
        return get(songId, userId);
    }

    /** 撤回自己的校正。 */
    @Transactional
    public void withdraw(Long userId, Long songId) {
        requireSong(songId);
        correctionMapper.delete(new LambdaQueryWrapper<LyricOffsetCorrection>()
                .eq(LyricOffsetCorrection::getUserId, userId)
                .eq(LyricOffsetCorrection::getSongId, songId));
    }

    private void requireSong(Long songId) {
        if (songId == null) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "歌曲 id 不能为空");
        }
        Song song = songMapper.selectById(songId);
        if (song == null) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "歌曲不存在或已下架");
        }
    }

    private LyricOffsetCorrection getMine(Long songId, Long userId) {
        return correctionMapper.selectOne(new LambdaQueryWrapper<LyricOffsetCorrection>()
                .eq(LyricOffsetCorrection::getSongId, songId)
                .eq(LyricOffsetCorrection::getUserId, userId)
                .last("LIMIT 1"));
    }

    private List<Integer> listOffsets(Long songId) {
        List<LyricOffsetCorrection> rows = correctionMapper.selectList(
                new LambdaQueryWrapper<LyricOffsetCorrection>()
                        .eq(LyricOffsetCorrection::getSongId, songId));
        List<Integer> offsets = new ArrayList<>();
        for (LyricOffsetCorrection row : rows) {
            if (row != null && row.getOffsetMs() != null) {
                offsets.add(row.getOffsetMs());
            }
        }
        return offsets;
    }

    /** 共识值：上报数达标时取中位数，否则不下发。 */
    private Integer consensus(List<Integer> offsets) {
        if (offsets == null || offsets.size() < MIN_REPORTS) {
            return null;
        }
        Collections.sort(offsets);
        int size = offsets.size();
        int median = size % 2 == 1
                ? offsets.get(size / 2)
                : Math.round((offsets.get(size / 2 - 1) + offsets.get(size / 2)) / 2.0f);
        return clamp(median);
    }

    private int clamp(Integer value) {
        int offset = value == null ? 0 : value;
        return Math.max(-LIMIT_MS, Math.min(LIMIT_MS, offset));
    }
}

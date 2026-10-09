package com.musicholo.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.SongQuery;
import com.musicholo.dto.SongSaveDTO;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserFavorite;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongCategoryMapper;
import com.musicholo.mapper.UserFavoriteMapper;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;

/**
 * 歌曲服务：增删改查、播放（播放量统计）
 */
@Service
@RequiredArgsConstructor
public class SongService {

    private static final int MAX_LRC_BYTES = 65_535;

    private final SongMapper songMapper;
    private final SingerMapper singerMapper;
    private final SongCategoryMapper categoryMapper;
    private final UserFavoriteMapper userFavoriteMapper;
    private final SongAssembler songAssembler;
    private final PlayHistoryService playHistoryService;

    /**
     * 歌曲分页查询（可按关键字 / 分类 / 歌手过滤）
     */
    public Page<SongVO> page(SongQuery query) {
        LambdaQueryWrapper<Song> qw = new LambdaQueryWrapper<>();
        qw.and(StrUtil.isNotBlank(query.getKeyword()),
                w -> w.like(Song::getTitle, query.getKeyword()).or().like(Song::getAlbum, query.getKeyword()));
        qw.eq(query.getCategoryId() != null, Song::getCategoryId, query.getCategoryId());
        qw.eq(query.getSingerId() != null, Song::getSingerId, query.getSingerId());
        qw.eq(Song::getStatus, 1);
        qw.orderByDesc(Song::getPlayCount).orderByDesc(Song::getId);
        Page<Song> page = songMapper.selectPage(
                new Page<>(query.getPageNum(), query.getPageSize()), qw);
        Page<SongVO> voPage = songAssembler.toVOPage(page);
        // 列表接口不返回歌词正文，避免原文、译文和罗马音随分页泄漏。
        voPage.getRecords().forEach(vo -> {
            vo.setLyric(null);
            vo.setLyricTranslation(null);
            vo.setLyricRomaji(null);
        });
        return voPage;
    }

    /**
     * 歌曲详情（含歌词、当前用户收藏状态）
     */
    public SongVO detail(Long id, Long currentUserId) {
        Song song = getById(id);
        SongVO vo = songAssembler.toVO(song);
        if (currentUserId != null) {
            Long favCount = userFavoriteMapper.selectCount(new LambdaQueryWrapper<UserFavorite>()
                    .eq(UserFavorite::getUserId, currentUserId)
                    .eq(UserFavorite::getSongId, id));
            vo.setFavorite(favCount != null && favCount > 0);
        }
        return vo;
    }

    /**
     * 新增 / 修改歌曲
     */
    public SongVO save(SongSaveDTO dto) {
        if (singerMapper.selectById(dto.getSingerId()) == null) {
            throw new BusinessException("歌手不存在");
        }
        if (categoryMapper.selectById(dto.getCategoryId()) == null) {
            throw new BusinessException("歌曲分类不存在");
        }
        validateLrcSize(dto.getLyric());
        validateLrcSize(dto.getLyricTranslation());
        validateLrcSize(dto.getLyricRomaji());
        Song song;
        if (dto.getId() == null) {
            song = new Song();
            song.setPlayCount(0L);
            song.setStatus(dto.getStatus() == null ? 1 : dto.getStatus());
        } else {
            song = getById(dto.getId());
            if (dto.getStatus() != null) {
                song.setStatus(dto.getStatus());
            }
        }
        song.setTitle(dto.getTitle());
        song.setSingerId(dto.getSingerId());
        song.setCategoryId(dto.getCategoryId());
        song.setAlbum(dto.getAlbum());
        song.setDuration(dto.getDuration());
        song.setCover(dto.getCover());
        song.setAudioUrl(dto.getAudioUrl());
        song.setLyric(dto.getLyric());
        if (dto.getId() == null || dto.getLyricTranslation() != null) {
            song.setLyricTranslation(dto.getLyricTranslation());
        }
        if (dto.getId() == null || dto.getLyricRomaji() != null) {
            song.setLyricRomaji(dto.getLyricRomaji());
        }
        if (dto.getId() == null) {
            songMapper.insert(song);
        } else {
            songMapper.updateById(song);
        }
        return songAssembler.toVO(song);
    }

    private void validateLrcSize(String lrc) {
        if (lrc != null && lrc.getBytes(StandardCharsets.UTF_8).length > MAX_LRC_BYTES) {
            throw new BusinessException("单份 LRC 文本不能超过 64 KB");
        }
    }

    /**
     * 删除歌曲
     */
    public void delete(Long id) {
        getById(id);
        songMapper.deleteById(id);
    }

    /**
     * 歌曲播放：播放量 +1，返回最新播放量
     */
    @Transactional(rollbackFor = Exception.class)
    public Long play(Long id, Long currentUserId) {
        Song song = getById(id);
        if (!Integer.valueOf(1).equals(song.getStatus())) {
            throw new BusinessException("歌曲已下架");
        }
        songMapper.update(null, new LambdaUpdateWrapper<Song>()
                .eq(Song::getId, id)
                .setSql("play_count = play_count + 1"));
        if (currentUserId != null) {
            playHistoryService.record(currentUserId, id);
        }
        Song latest = songMapper.selectById(id);
        return latest.getPlayCount() == null ? 0L : latest.getPlayCount();
    }

    public Song getById(Long id) {
        Song song = songMapper.selectById(id);
        if (song == null) {
            throw new BusinessException("歌曲不存在");
        }
        return song;
    }
}

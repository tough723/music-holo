package com.musicholo.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.mapper.AlbumMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.AlbumVO;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/** 专辑是歌曲曲库中的聚合视图，不重复维护另一套曲目信息。 */
@Service
@RequiredArgsConstructor
public class AlbumService {

    private final AlbumMapper albumMapper;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;

    public IPage<AlbumVO> page(long pageNum, long pageSize, String keyword) {
        long safePageNum = Math.max(1, pageNum);
        long safePageSize = Math.max(1, Math.min(48, pageSize));
        return albumMapper.selectAlbumPage(new Page<>(safePageNum, safePageSize), StrUtil.trim(keyword));
    }

    public AlbumVO detail(String album, Long singerId) {
        if (StrUtil.isBlank(album)) {
            throw new BusinessException("请指定专辑名称");
        }
        AlbumVO result = albumMapper.selectAlbum(album.trim(), singerId);
        if (result == null) {
            throw new BusinessException("专辑不存在或已下架");
        }
        return result;
    }

    public List<SongVO> songs(String album, Long singerId) {
        AlbumVO albumInfo = detail(album, singerId);
        Long resolvedSingerId = singerId != null ? singerId : albumInfo.getSingerId();
        LambdaQueryWrapper<Song> query = new LambdaQueryWrapper<Song>()
                .eq(Song::getAlbum, album.trim())
                .eq(Song::getStatus, 1)
                .orderByAsc(Song::getId);
        if (resolvedSingerId == null) {
            query.isNull(Song::getSingerId);
        } else {
            query.eq(Song::getSingerId, resolvedSingerId);
        }
        List<SongVO> songs = songAssembler.toVOList(songMapper.selectList(query));
        songs.forEach(song -> {
            song.setLyric(null);
            song.setLyricTranslation(null);
            song.setLyricRomaji(null);
        });
        return songs;
    }
}

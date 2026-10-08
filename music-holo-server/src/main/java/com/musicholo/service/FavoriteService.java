package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserFavorite;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserFavoriteMapper;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 歌曲收藏服务：添加收藏、取消收藏、收藏列表查询
 */
@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final UserFavoriteMapper favoriteMapper;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;

    /**
     * 添加收藏
     */
    public void add(Long userId, Long songId) {
        if (songMapper.selectById(songId) == null) {
            throw new BusinessException("歌曲不存在");
        }
        Long count = favoriteMapper.selectCount(new LambdaQueryWrapper<UserFavorite>()
                .eq(UserFavorite::getUserId, userId)
                .eq(UserFavorite::getSongId, songId));
        if (count != null && count > 0) {
            throw new BusinessException("已收藏过该歌曲");
        }
        UserFavorite favorite = new UserFavorite();
        favorite.setUserId(userId);
        favorite.setSongId(songId);
        favoriteMapper.insert(favorite);
    }

    /**
     * 取消收藏
     */
    public void cancel(Long userId, Long songId) {
        favoriteMapper.delete(new LambdaQueryWrapper<UserFavorite>()
                .eq(UserFavorite::getUserId, userId)
                .eq(UserFavorite::getSongId, songId));
    }

    /**
     * 收藏列表分页查询（按收藏时间倒序）
     */
    public Page<SongVO> page(Long userId, long pageNum, long pageSize) {
        Page<UserFavorite> page = favoriteMapper.selectPage(new Page<>(pageNum, pageSize),
                new LambdaQueryWrapper<UserFavorite>()
                        .eq(UserFavorite::getUserId, userId)
                        .orderByDesc(UserFavorite::getCreateTime)
                        .orderByDesc(UserFavorite::getId));
        List<Long> songIds = page.getRecords().stream()
                .map(UserFavorite::getSongId).collect(Collectors.toList());
        List<Song> songs = new ArrayList<>();
        if (!songIds.isEmpty()) {
            Map<Long, Song> songMap = songMapper.selectBatchIds(songIds).stream()
                    .collect(Collectors.toMap(Song::getId, s -> s));
            for (Long songId : songIds) {
                Song song = songMap.get(songId);
                if (song != null) {
                    songs.add(song);
                }
            }
        }
        List<SongVO> voList = songAssembler.toVOList(songs);
        voList.forEach(vo -> {
            vo.setLyric(null);
            vo.setFavorite(true);
        });
        Page<SongVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        voPage.setRecords(voList);
        return voPage;
    }

    /**
     * 当前用户收藏的全部歌曲 id（前端用于标记收藏状态）
     */
    public List<Long> ids(Long userId) {
        return favoriteMapper.selectList(new LambdaQueryWrapper<UserFavorite>()
                        .eq(UserFavorite::getUserId, userId))
                .stream().map(UserFavorite::getSongId).collect(Collectors.toList());
    }

    /**
     * 判断是否已收藏
     */
    public boolean isFavorite(Long userId, Long songId) {
        Long count = favoriteMapper.selectCount(new LambdaQueryWrapper<UserFavorite>()
                .eq(UserFavorite::getUserId, userId)
                .eq(UserFavorite::getSongId, songId));
        return count != null && count > 0;
    }
}

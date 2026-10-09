package com.musicholo.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.PlaylistQuery;
import com.musicholo.dto.PlaylistSaveDTO;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.PlaylistSong;
import com.musicholo.entity.Song;
import com.musicholo.entity.SysUser;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.PlaylistSongMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.SysUserMapper;
import com.musicholo.vo.PlaylistVO;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 歌单服务：增删改查、歌单歌曲查询、歌单歌曲维护
 */
@Service
@RequiredArgsConstructor
public class PlaylistService {

    private final PlaylistMapper playlistMapper;
    private final PlaylistSongMapper playlistSongMapper;
    private final SongMapper songMapper;
    private final SysUserMapper sysUserMapper;
    private final UserService userService;
    private final SongAssembler songAssembler;

    /**
     * 歌单分页查询
     */
    public Page<PlaylistVO> page(PlaylistQuery query, Long currentUserId) {
        LambdaQueryWrapper<Playlist> qw = new LambdaQueryWrapper<>();
        qw.like(StrUtil.isNotBlank(query.getKeyword()), Playlist::getName, query.getKeyword());
        if (Boolean.TRUE.equals(query.getOnlyMine())) {
            if (currentUserId == null) {
                // 匿名用户“只看我的”必须为空，不能退化成公开列表
                qw.eq(Playlist::getId, -1L);
            } else {
                qw.eq(Playlist::getCreatorId, currentUserId);
            }
        } else {
            // 默认展示公开歌单 + 自己的歌单
            qw.and(w -> w.eq(Playlist::getIsPublic, 1)
                    .or(currentUserId != null, ww -> ww.eq(Playlist::getCreatorId, currentUserId)));
        }
        qw.orderByDesc(Playlist::getPlayCount).orderByDesc(Playlist::getId);
        Page<Playlist> page = playlistMapper.selectPage(
                new Page<>(query.getPageNum(), query.getPageSize()), qw);

        // 歌曲数量统计
        List<Map<String, Object>> countRows = playlistSongMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<PlaylistSong>()
                        .select("playlist_id AS playlistId", "COUNT(1) AS cnt")
                        .groupBy("playlist_id"));
        Map<Long, Long> songCountMap = new HashMap<>();
        for (Map<String, Object> row : countRows) {
            songCountMap.put(((Number) row.get("playlistId")).longValue(),
                    ((Number) row.get("cnt")).longValue());
        }
        // 创建者昵称
        List<Long> creatorIds = page.getRecords().stream()
                .map(Playlist::getCreatorId).filter(id -> id != null && id > 0).distinct()
                .collect(Collectors.toList());
        Map<Long, String> creatorNames = new HashMap<>();
        if (!creatorIds.isEmpty()) {
            creatorNames = sysUserMapper.selectBatchIds(creatorIds).stream()
                    .collect(Collectors.toMap(SysUser::getId,
                            u -> StrUtil.isBlank(u.getNickname()) ? u.getUsername() : u.getNickname()));
        }

        Page<PlaylistVO> voPage = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        List<PlaylistVO> records = new ArrayList<>();
        for (Playlist playlist : page.getRecords()) {
            PlaylistVO vo = BeanUtil.copyProperties(playlist, PlaylistVO.class);
            vo.setSongCount(songCountMap.getOrDefault(playlist.getId(), 0L));
            vo.setCreatorName(creatorNames.getOrDefault(playlist.getCreatorId(), ""));
            records.add(vo);
        }
        voPage.setRecords(records);
        return voPage;
    }

    /**
     * 歌单详情（含歌曲数量）
     */
    public PlaylistVO detail(Long id, Long currentUserId) {
        Playlist playlist = getById(id);
        assertVisible(playlist, currentUserId);
        PlaylistVO vo = BeanUtil.copyProperties(playlist, PlaylistVO.class);
        Long count = playlistSongMapper.selectCount(
                new LambdaQueryWrapper<PlaylistSong>().eq(PlaylistSong::getPlaylistId, id));
        vo.setSongCount(count == null ? 0L : count);
        SysUser creator = sysUserMapper.selectById(playlist.getCreatorId());
        if (creator != null) {
            vo.setCreatorName(StrUtil.isBlank(creator.getNickname()) ? creator.getUsername() : creator.getNickname());
        }
        return vo;
    }

    /**
     * 歌单内的歌曲列表（按歌单内排序）
     */
    public List<SongVO> songsOfPlaylist(Long id, Long currentUserId) {
        Playlist playlist = getById(id);
        assertVisible(playlist, currentUserId);
        List<PlaylistSong> relations = playlistSongMapper.selectList(
                new LambdaQueryWrapper<PlaylistSong>()
                        .eq(PlaylistSong::getPlaylistId, id)
                        .orderByAsc(PlaylistSong::getSort)
                        .orderByAsc(PlaylistSong::getId));
        if (relations.isEmpty()) {
            return List.of();
        }
        List<Long> songIds = relations.stream().map(PlaylistSong::getSongId).collect(Collectors.toList());
        Map<Long, Song> songMap = songMapper.selectBatchIds(songIds).stream()
                .collect(Collectors.toMap(Song::getId, s -> s));
        List<Song> ordered = new ArrayList<>();
        for (Long songId : songIds) {
            Song song = songMap.get(songId);
            if (song != null) {
                ordered.add(song);
            }
        }
        return songAssembler.toVOList(ordered);
    }

    /**
     * 新增 / 修改歌单
     */
    public PlaylistVO save(PlaylistSaveDTO dto, Long userId) {
        Playlist playlist;
        if (dto.getId() == null) {
            playlist = new Playlist();
            playlist.setCreatorId(userId);
            playlist.setPlayCount(0L);
            playlist.setIsPublic(dto.getIsPublic() == null ? 1 : dto.getIsPublic());
        } else {
            playlist = getById(dto.getId());
            checkOwner(playlist, userId);
            if (dto.getIsPublic() != null) {
                playlist.setIsPublic(dto.getIsPublic());
            }
        }
        playlist.setName(dto.getName());
        playlist.setCover(dto.getCover());
        playlist.setDescription(dto.getDescription());
        if (dto.getId() == null) {
            playlistMapper.insert(playlist);
        } else {
            playlistMapper.updateById(playlist);
        }
        return detail(playlist.getId(), userId);
    }

    /**
     * 删除歌单（同时删除歌单-歌曲关联）
     */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id, Long userId) {
        Playlist playlist = getById(id);
        checkOwner(playlist, userId);
        playlistMapper.deleteById(id);
        playlistSongMapper.delete(new LambdaQueryWrapper<PlaylistSong>().eq(PlaylistSong::getPlaylistId, id));
    }

    /**
     * 批量添加曲库中可播放的歌曲到歌单（自动去重；先批量校验，避免每首歌单独查库）
     */
    @Transactional(rollbackFor = Exception.class)
    public int addSongs(Long playlistId, List<Long> songIds, Long userId) {
        Playlist playlist = getById(playlistId);
        checkOwner(playlist, userId);
        if (songIds == null || songIds.isEmpty()) {
            throw new BusinessException("歌曲列表不能为空");
        }
        List<PlaylistSong> existingRelations = playlistSongMapper.selectList(
                new LambdaQueryWrapper<PlaylistSong>().eq(PlaylistSong::getPlaylistId, playlistId));
        Set<Long> existingIds = existingRelations.stream().map(PlaylistSong::getSongId)
                .collect(Collectors.toCollection(HashSet::new));
        int sort = existingRelations.stream().map(PlaylistSong::getSort).filter(s -> s != null)
                .max(Integer::compareTo).orElse(0);

        List<Long> candidates = songIds.stream().filter(id -> id != null && id > 0 && !existingIds.contains(id))
                .distinct().collect(Collectors.toList());
        Map<Long, Song> availableSongs = new HashMap<>();
        final int batchSize = 400;
        for (int start = 0; start < candidates.size(); start += batchSize) {
            List<Long> batch = candidates.subList(start, Math.min(start + batchSize, candidates.size()));
            songMapper.selectBatchIds(batch).stream()
                    .filter(song -> Integer.valueOf(1).equals(song.getStatus()))
                    .forEach(song -> availableSongs.put(song.getId(), song));
        }

        int added = 0;
        for (Long songId : songIds) {
            if (existingIds.contains(songId) || !availableSongs.containsKey(songId)) {
                continue;
            }
            PlaylistSong relation = new PlaylistSong();
            relation.setPlaylistId(playlistId);
            relation.setSongId(songId);
            relation.setSort(++sort);
            playlistSongMapper.insert(relation);
            existingIds.add(songId);
            added++;
        }
        return added;
    }

    /**
     * 从歌单移除一首歌曲
     */
    public void removeSong(Long playlistId, Long songId, Long userId) {
        Playlist playlist = getById(playlistId);
        checkOwner(playlist, userId);
        playlistSongMapper.delete(new LambdaQueryWrapper<PlaylistSong>()
                .eq(PlaylistSong::getPlaylistId, playlistId)
                .eq(PlaylistSong::getSongId, songId));
    }

    public Playlist getById(Long id) {
        Playlist playlist = playlistMapper.selectById(id);
        if (playlist == null) {
            throw new BusinessException("歌单不存在");
        }
        return playlist;
    }

    /** 私密歌单仅创建者或管理员可查看，避免通过猜测 ID 读取私有曲目 */
    private void assertVisible(Playlist playlist, Long currentUserId) {
        if (!Integer.valueOf(1).equals(playlist.getIsPublic())) {
            boolean owner = currentUserId != null && currentUserId.equals(playlist.getCreatorId());
            boolean admin = currentUserId != null && userService.isAdmin(currentUserId);
            if (!owner && !admin) {
                throw new BusinessException(404, "歌单不存在");
            }
        }
    }

    /**
     * 校验当前用户是否为歌单创建者（或管理员）
     */
    private void checkOwner(Playlist playlist, Long userId) {
        if (!playlist.getCreatorId().equals(userId) && !userService.isAdmin(userId)) {
            throw new BusinessException(403, "只能操作自己创建的歌单");
        }
    }
}

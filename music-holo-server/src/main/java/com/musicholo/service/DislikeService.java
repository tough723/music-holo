package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.musicholo.common.Result;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Singer;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserSingerDislike;
import com.musicholo.entity.UserSongDislike;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserSingerDislikeMapper;
import com.musicholo.mapper.UserSongDislikeMapper;
import com.musicholo.vo.DislikeSummaryVO;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 账号隔离的不喜欢规则。添加和撤销都不改曲库；查询始终按 userId 过滤。
 */
@Service
@RequiredArgsConstructor
public class DislikeService {

    public static final int MAX_SONGS = 500;
    public static final int MAX_SINGERS = 200;

    private final UserSongDislikeMapper songDislikeMapper;
    private final UserSingerDislikeMapper singerDislikeMapper;
    private final SongMapper songMapper;
    private final SingerMapper singerMapper;

    public DislikeSummaryVO summary(Long userId) {
        List<UserSongDislike> songRules = listSongRules(userId);
        List<UserSingerDislike> singerRules = listSingerRules(userId);
        Map<Long, Song> songs = loadSongs(songRules);
        Map<Long, Singer> singers = loadSingers(singerRules, songs);

        DislikeSummaryVO summary = new DislikeSummaryVO();
        summary.setSongLimit(MAX_SONGS);
        summary.setSingerLimit(MAX_SINGERS);
        List<Long> songIds = new ArrayList<>();
        List<DislikeSummaryVO.SongRule> songViews = new ArrayList<>();
        for (UserSongDislike rule : songRules) {
            if (rule.getSongId() == null) {
                continue;
            }
            songIds.add(rule.getSongId());
            Song song = songs.get(rule.getSongId());
            DislikeSummaryVO.SongRule view = new DislikeSummaryVO.SongRule();
            view.setId(rule.getSongId());
            if (song == null) {
                view.setTitle("已下架或已删除的歌曲");
            } else {
                view.setTitle(song.getTitle());
                view.setSingerId(song.getSingerId());
                view.setCover(song.getCover());
                Singer singer = song.getSingerId() == null ? null : singers.get(song.getSingerId());
                view.setSingerName(singer == null ? "" : singer.getName());
            }
            songViews.add(view);
        }
        List<Long> singerIds = new ArrayList<>();
        List<DislikeSummaryVO.SingerRule> singerViews = new ArrayList<>();
        for (UserSingerDislike rule : singerRules) {
            if (rule.getSingerId() == null) {
                continue;
            }
            singerIds.add(rule.getSingerId());
            Singer singer = singers.get(rule.getSingerId());
            DislikeSummaryVO.SingerRule view = new DislikeSummaryVO.SingerRule();
            view.setId(rule.getSingerId());
            if (singer == null) {
                view.setName("已下架或已删除的歌手");
            } else {
                view.setName(singer.getName());
                view.setAvatar(singer.getAvatar());
                view.setRegion(singer.getRegion());
            }
            singerViews.add(view);
        }
        summary.setSongIds(songIds);
        summary.setSingerIds(singerIds);
        summary.setSongs(songViews);
        summary.setSingers(singerViews);
        return summary;
    }

    public DislikeRules rules(Long userId) {
        if (userId == null) {
            return DislikeRules.empty();
        }
        Set<Long> songIds = new HashSet<>();
        for (UserSongDislike rule : listSongRules(userId)) {
            if (rule.getSongId() != null) {
                songIds.add(rule.getSongId());
            }
        }
        Set<Long> singerIds = new HashSet<>();
        for (UserSingerDislike rule : listSingerRules(userId)) {
            if (rule.getSingerId() != null) {
                singerIds.add(rule.getSingerId());
            }
        }
        return DislikeRules.of(songIds, singerIds);
    }

    public void addSong(Long userId, Long songId) {
        requireUser(userId);
        if (songId == null || songMapper.selectById(songId) == null) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "歌曲不存在");
        }
        List<UserSongDislike> existing = listSongRules(userId);
        if (existing.stream().anyMatch(rule -> songId.equals(rule.getSongId()))) {
            return;
        }
        if (existing.size() >= MAX_SONGS) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "不喜欢的歌曲已达 500 首上限");
        }
        UserSongDislike row = new UserSongDislike();
        row.setUserId(userId);
        row.setSongId(songId);
        insertSong(row);
    }

    public void removeSong(Long userId, Long songId) {
        requireUser(userId);
        if (songId == null) {
            return;
        }
        songDislikeMapper.delete(new LambdaQueryWrapper<UserSongDislike>()
                .eq(UserSongDislike::getUserId, userId)
                .eq(UserSongDislike::getSongId, songId));
    }

    public void addSinger(Long userId, Long singerId) {
        requireUser(userId);
        if (singerId == null || singerMapper.selectById(singerId) == null) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "歌手不存在");
        }
        List<UserSingerDislike> existing = listSingerRules(userId);
        if (existing.stream().anyMatch(rule -> singerId.equals(rule.getSingerId()))) {
            return;
        }
        if (existing.size() >= MAX_SINGERS) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "不喜欢的歌手已达 200 位上限");
        }
        UserSingerDislike row = new UserSingerDislike();
        row.setUserId(userId);
        row.setSingerId(singerId);
        insertSinger(row);
    }

    public void removeSinger(Long userId, Long singerId) {
        requireUser(userId);
        if (singerId == null) {
            return;
        }
        singerDislikeMapper.delete(new LambdaQueryWrapper<UserSingerDislike>()
                .eq(UserSingerDislike::getUserId, userId)
                .eq(UserSingerDislike::getSingerId, singerId));
    }

    private void insertSong(UserSongDislike row) {
        try {
            songDislikeMapper.insert(row);
        } catch (DuplicateKeyException ex) {
            // 并发重复添加视为成功，不覆盖他人规则。
        }
    }

    private void insertSinger(UserSingerDislike row) {
        try {
            singerDislikeMapper.insert(row);
        } catch (DuplicateKeyException ex) {
            // 并发重复添加视为成功。
        }
    }

    private List<UserSongDislike> listSongRules(Long userId) {
        List<UserSongDislike> rows = new ArrayList<>(songDislikeMapper.selectList(new LambdaQueryWrapper<UserSongDislike>()
                .eq(UserSongDislike::getUserId, userId)));
        rows.sort(Comparator.comparing(UserSongDislike::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(UserSongDislike::getId, Comparator.nullsLast(Comparator.reverseOrder())));
        return rows;
    }

    private List<UserSingerDislike> listSingerRules(Long userId) {
        List<UserSingerDislike> rows = new ArrayList<>(singerDislikeMapper.selectList(new LambdaQueryWrapper<UserSingerDislike>()
                .eq(UserSingerDislike::getUserId, userId)));
        rows.sort(Comparator.comparing(UserSingerDislike::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(UserSingerDislike::getId, Comparator.nullsLast(Comparator.reverseOrder())));
        return rows;
    }

    private Map<Long, Song> loadSongs(List<UserSongDislike> rules) {
        List<Long> ids = rules.stream().map(UserSongDislike::getSongId).filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, Song> songs = new HashMap<>();
        for (Song song : songMapper.selectBatchIds(ids)) {
            if (song != null && song.getId() != null) {
                songs.putIfAbsent(song.getId(), song);
            }
        }
        return songs;
    }

    private Map<Long, Singer> loadSingers(List<UserSingerDislike> singerRules, Map<Long, Song> songs) {
        Set<Long> ids = new HashSet<>();
        for (UserSingerDislike rule : singerRules) {
            if (rule.getSingerId() != null) {
                ids.add(rule.getSingerId());
            }
        }
        for (Song song : songs.values()) {
            if (song.getSingerId() != null) {
                ids.add(song.getSingerId());
            }
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, Singer> singers = new HashMap<>();
        for (Singer singer : singerMapper.selectBatchIds(ids)) {
            if (singer != null && singer.getId() != null) {
                singers.putIfAbsent(singer.getId(), singer);
            }
        }
        return singers;
    }

    private void requireUser(Long userId) {
        if (userId == null) {
            throw new BusinessException(Result.CODE_UNAUTHORIZED, "未登录或登录已过期，请重新登录");
        }
    }
}

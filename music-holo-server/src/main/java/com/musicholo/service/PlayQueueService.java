package com.musicholo.service;

import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 播放列表服务（基于 Redis 的登录用户播放队列）
 * <p>
 * 与「歌单」区分：歌单是持久化的作品集合，播放列表是用户维度的临时播放队列。
 */
@Service
@RequiredArgsConstructor
public class PlayQueueService {

    /** Redis key 前缀：play:queue:{userId} */
    private static final String KEY_PREFIX = "play:queue:";

    private final StringRedisTemplate redisTemplate;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;

    /**
     * 获取当前用户的播放队列（歌曲详情，保持队列顺序）
     */
    public List<SongVO> getQueue(Long userId) {
        List<String> ids = redisTemplate.opsForList().range(key(userId), 0, -1);
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        List<Long> idList = ids.stream().map(Long::valueOf).collect(Collectors.toList());
        Map<Long, Song> songMap = songMapper.selectBatchIds(idList).stream()
                .collect(Collectors.toMap(Song::getId, s -> s));
        List<Song> ordered = new ArrayList<>();
        for (Long id : idList) {
            Song song = songMap.get(id);
            if (song != null) {
                ordered.add(song);
            }
        }
        return songAssembler.toVOList(ordered);
    }

    /**
     * 添加一首歌曲到队尾（已存在则先移除再追加，即去重并置尾）
     */
    public int add(Long userId, Long songId) {
        checkSongExists(songId);
        redisTemplate.opsForList().remove(key(userId), 0, String.valueOf(songId));
        redisTemplate.opsForList().rightPush(key(userId), String.valueOf(songId));
        return size(userId);
    }

    /**
     * 批量添加歌曲到队尾（自动去重）
     */
    public int addBatch(Long userId, List<Long> songIds) {
        if (songIds == null || songIds.isEmpty()) {
            throw new BusinessException("歌曲列表不能为空");
        }
        List<String> existing = redisTemplate.opsForList().range(key(userId), 0, -1);
        Set<String> existSet = existing == null ? new HashSet<>() : new HashSet<>(existing);
        List<String> toAdd = new ArrayList<>();
        for (Long songId : songIds) {
            checkSongExists(songId);
            String idStr = String.valueOf(songId);
            if (!existSet.contains(idStr)) {
                existSet.add(idStr);
                toAdd.add(idStr);
            }
        }
        if (!toAdd.isEmpty()) {
            redisTemplate.opsForList().rightPushAll(key(userId), toAdd);
        }
        return size(userId);
    }

    /**
     * 从队列移除一首歌曲
     */
    public void remove(Long userId, Long songId) {
        redisTemplate.opsForList().remove(key(userId), 0, String.valueOf(songId));
    }

    /**
     * 清空播放队列
     */
    public void clear(Long userId) {
        redisTemplate.delete(key(userId));
    }

    /**
     * 队列长度
     */
    public int size(Long userId) {
        Long size = redisTemplate.opsForList().size(key(userId));
        return size == null ? 0 : size.intValue();
    }

    private String key(Long userId) {
        return KEY_PREFIX + userId;
    }

    private void checkSongExists(Long songId) {
        if (songMapper.selectById(songId) == null) {
            throw new BusinessException("歌曲不存在：" + songId);
        }
    }
}

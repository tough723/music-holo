package com.musicholo.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.musicholo.common.Result;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.PlaySessionSaveDTO;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SongMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 播放会话快照（登录用户维度，基于 Redis，保留 7 天）。
 * <p>
 * 与 {@code play:queue:{userId}} 的播放队列不同：这里保存的是「换设备后接着听」所需的完整状态——
 * 队列、当前曲目、进度、播放模式和倍速，一条 JSON 字符串整体读写，不建 MySQL 表。
 * <p>
 * 队列里的歌曲可能在服务端被删除，读取时原样返回存储内容，失效 id 由客户端在拉取歌曲详情时丢弃。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlaySessionService {

    /** Redis key 前缀：play:session:{userId} */
    private static final String KEY_PREFIX = "play:session:";

    /** 快照 JSON 的反序列化类型：数字按大小落到 Integer / Long / Double */
    private static final TypeReference<Map<String, Object>> SNAPSHOT_TYPE = new TypeReference<>() {
    };

    private final StringRedisTemplate redisTemplate;
    private final SongMapper songMapper;
    private final ObjectMapper objectMapper;

    /**
     * 保存（整体覆盖）当前会话快照，返回结构版本与写入 / 到期时间。
     */
    public Map<String, Object> save(Long userId, PlaySessionSaveDTO dto) {
        Map<String, Object> payload;
        try {
            payload = PlaySessionRules.normalize(dto);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, ex.getMessage());
        }
        requireSongsExist(longs(payload.get("queueIds")));

        long savedAt = System.currentTimeMillis();
        long expiresAt = savedAt + PlaySessionRules.TTL_MS;
        payload.put("savedAt", savedAt);
        payload.put("expiresAt", expiresAt);

        redisTemplate.opsForValue().set(key(userId), toJson(payload), Duration.ofMillis(PlaySessionRules.TTL_MS));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", PlaySessionRules.VERSION);
        result.put("savedAt", savedAt);
        result.put("expiresAt", expiresAt);
        return result;
    }

    /**
     * 读取当前会话快照；未保存或已过期时返回 null。
     */
    public Map<String, Object> get(Long userId) {
        String json = redisTemplate.opsForValue().get(key(userId));
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, SNAPSHOT_TYPE);
        } catch (JsonProcessingException ex) {
            // 结构不兼容的旧快照按「没有快照」处理，客户端下一次 PUT 会覆盖它。
            log.warn("播放会话快照解析失败，已忽略 userId={}", userId);
            redisTemplate.delete(key(userId));
            return null;
        }
    }

    /**
     * 清除当前会话快照。
     */
    public void clear(Long userId) {
        redisTemplate.delete(key(userId));
    }

    /**
     * 队列里的歌曲必须都还在曲库里，否则整份快照拒绝写入，并指出第一个缺失的歌曲 id。
     */
    private void requireSongsExist(List<Long> queueIds) {
        List<Long> distinct = queueIds.stream().distinct().toList();
        Set<Long> found = new HashSet<>();
        for (Song song : songMapper.selectBatchIds(distinct)) {
            if (song != null && song.getId() != null) {
                found.add(song.getId());
            }
        }
        if (found.size() == distinct.size()) {
            return;
        }
        for (Long id : queueIds) {
            if (!found.contains(id)) {
                throw new BusinessException(Result.CODE_BAD_REQUEST, "歌曲不存在：" + id);
            }
        }
    }

    /** Jackson 回读的数字可能是 Integer / Long，统一转成 Long 再查库。 */
    private static List<Long> longs(Object raw) {
        List<Long> ids = new ArrayList<>();
        if (raw instanceof Collection<?> collection) {
            for (Object item : collection) {
                if (item instanceof Number number) {
                    ids.add(number.longValue());
                }
            }
        }
        return ids;
    }

    private String toJson(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new BusinessException("播放会话保存失败");
        }
    }

    private String key(Long userId) {
        return KEY_PREFIX + userId;
    }
}

package com.musicholo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.PlaySessionSaveDTO;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SongMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 播放会话快照的 Redis 读写：整份 JSON 落 key、TTL 7 天、无快照返回 null。
 */
@ExtendWith(MockitoExtension.class)
class PlaySessionServiceTest {

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private ValueOperations<String, String> valueOperations;
    @Mock private SongMapper songMapper;

    private PlaySessionService service;

    @BeforeEach
    void setUp() {
        service = new PlaySessionService(redisTemplate, songMapper, new ObjectMapper());
    }

    @Test
    void saveWritesJsonSnapshotWithSevenDayTtl() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(songMapper.selectBatchIds(any())).thenReturn(List.of(song(1L), song(2L)));

        Map<String, Object> saved = service.save(7L, session(List.of(1L, 2L), 2L, 12.5, "loop", 1.25));

        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(eq("play:session:7"), json.capture(), eq(Duration.ofMillis(PlaySessionRules.TTL_MS)));
        assertEquals(PlaySessionRules.VERSION, saved.get("version"));
        assertTrue(((Number) saved.get("savedAt")).longValue() > 0);
        assertEquals(((Number) saved.get("savedAt")).longValue() + PlaySessionRules.TTL_MS,
                ((Number) saved.get("expiresAt")).longValue());

        // 队列 id 以普通数字写入，避免 Long 精度问题
        assertTrue(json.getValue().contains("\"queueIds\":[1,2]"), json.getValue());
        assertTrue(json.getValue().contains("\"currentSongId\":2"), json.getValue());
        assertTrue(json.getValue().contains("\"mode\":\"loop\""), json.getValue());
        assertTrue(json.getValue().contains("\"position\":12.5"), json.getValue());
        assertTrue(json.getValue().contains("\"playbackRate\":1.25"), json.getValue());
        assertTrue(json.getValue().contains("\"expiresAt\":" + saved.get("expiresAt")), json.getValue());
    }

    @Test
    void saveRejectsMissingSongWithoutTouchingRedis() {
        when(songMapper.selectBatchIds(any())).thenReturn(List.of(song(1L)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(7L, session(List.of(1L, 9L), null, 0d, "order", 1d)));

        assertEquals(400, ex.getCode());
        assertEquals("歌曲不存在：9", ex.getMsg());
        verify(redisTemplate, never()).opsForValue();
    }

    @Test
    void saveTurnsRuleViolationsIntoBadRequest() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(7L, session(List.of(), null, 0d, "order", 1d)));

        assertEquals(400, ex.getCode());
        assertEquals("队列不能为空", ex.getMsg());
        verify(redisTemplate, never()).opsForValue();
    }

    @Test
    void getReturnsStoredSnapshotOrNothing() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("play:session:7")).thenReturn(
                "{\"version\":1,\"queueIds\":[1,2],\"currentSongId\":2,\"position\":12.5,"
                        + "\"mode\":\"loop\",\"playbackRate\":1.25,\"savedAt\":1,\"expiresAt\":2}");

        Map<String, Object> snapshot = service.get(7L);

        assertEquals(1, ((Number) snapshot.get("version")).intValue());
        assertEquals(List.of(1, 2), snapshot.get("queueIds"));
        assertEquals(2, ((Number) snapshot.get("currentSongId")).intValue());
        assertEquals(12.5, (Double) snapshot.get("position"));
        assertEquals("loop", snapshot.get("mode"));
        assertEquals(1.25, (Double) snapshot.get("playbackRate"));
        // 曲库中已删除的 id 原样返回，由客户端在取详情时丢弃
        assertEquals(2L, ((Number) snapshot.get("expiresAt")).longValue());

        when(valueOperations.get("play:session:7")).thenReturn(null);
        assertNull(service.get(7L));
    }

    @Test
    void unreadableSnapshotIsDroppedAndReportedAsMissing() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("play:session:7")).thenReturn("not-json");

        assertNull(service.get(7L));
        verify(redisTemplate).delete("play:session:7");
    }

    @Test
    void clearDeletesTheKey() {
        service.clear(7L);
        verify(redisTemplate).delete("play:session:7");
    }

    private static PlaySessionSaveDTO session(List<Long> queueIds, Long currentSongId, Double position,
                                              String mode, Double rate) {
        PlaySessionSaveDTO dto = new PlaySessionSaveDTO();
        dto.setQueueIds(queueIds);
        dto.setCurrentSongId(currentSongId);
        dto.setPosition(position);
        dto.setMode(mode);
        dto.setPlaybackRate(rate);
        return dto;
    }

    private static Song song(Long id) {
        Song song = new Song();
        song.setId(id);
        song.setTitle("歌曲" + id);
        song.setStatus(1);
        return song;
    }
}

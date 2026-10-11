package com.musicholo.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.StatEventDTO;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserStatEvent;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserStatEventMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 收听事件批量上报的幂等语义与汇总口径。
 */
@ExtendWith(MockitoExtension.class)
class StatEventServiceTest {

    private static final long NOW = System.currentTimeMillis();

    @Mock private UserStatEventMapper statEventMapper;
    @Mock private SongMapper songMapper;

    private StatEventService service;

    @BeforeAll
    static void registerMybatisLambdaMetadata() {
        register(UserStatEvent.class);
        register(Song.class);
    }

    private static void register(Class<?> entityType) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityType.getName());
        assistant.setCurrentNamespace(entityType.getName() + "Mapper");
        TableInfoHelper.initTableInfo(assistant, entityType);
    }

    @BeforeEach
    void setUp() {
        service = new StatEventService(statEventMapper, songMapper);
    }

    @Test
    void insertsOnlyNewEventsAndCountsStoredDuplicates() {
        UserStatEvent alreadyStored = new UserStatEvent();
        alreadyStored.setEventId("e1");
        when(statEventMapper.selectList(any())).thenReturn(List.of(alreadyStored));

        Map<String, Object> result = service.batch(7L, List.of(
                event("e1", "play", 1L, null, null, null),
                event("e2", "complete", 1L, 200, 200, null)));

        assertEquals(1, result.get("accepted"));
        assertEquals(1, result.get("duplicates"));

        ArgumentCaptor<UserStatEvent> inserted = ArgumentCaptor.forClass(UserStatEvent.class);
        verify(statEventMapper).insert(inserted.capture());
        UserStatEvent row = inserted.getValue();
        assertEquals(7L, row.getUserId());
        assertEquals("e2", row.getEventId());
        assertEquals("complete", row.getEventType());
        assertEquals(1L, row.getSongId());
        assertEquals(200, row.getSeconds());
        org.junit.jupiter.api.Assertions.assertNotNull(row.getOccurredAt());
    }

    @Test
    void duplicatesInsideOneBatchAreCountedOnce() {
        when(statEventMapper.selectList(any())).thenReturn(List.of());

        Map<String, Object> result = service.batch(7L, List.of(
                event("same", "play", 1L, null, null, null),
                event("same", "play", 1L, null, null, null),
                event("fresh", "skip", 1L, 200, 60, null)));

        assertEquals(2, result.get("accepted"));
        assertEquals(1, result.get("duplicates"));
        verify(statEventMapper, times(2)).insert(any(UserStatEvent.class));
    }

    @Test
    void concurrentUniqueKeyClashCountsAsDuplicate() {
        when(statEventMapper.selectList(any())).thenReturn(List.of());
        when(statEventMapper.insert(any(UserStatEvent.class))).thenThrow(new DuplicateKeyException("dup"));

        Map<String, Object> result = service.batch(7L, List.of(event("e1", "play", 1L, null, null, null)));

        assertEquals(0, result.get("accepted"));
        assertEquals(1, result.get("duplicates"));
    }

    @Test
    void rejectsOversizedBatchAndEmptyPayload() {
        List<StatEventDTO> tooMany = new ArrayList<>();
        for (int i = 0; i <= StatEventService.MAX_BATCH; i++) {
            tooMany.add(event("e" + i, "play", 1L, null, null, null));
        }
        BusinessException overflow = assertThrows(BusinessException.class, () -> service.batch(7L, tooMany));
        assertEquals(400, overflow.getCode());
        assertEquals("批量上报最多 200 条", overflow.getMsg());

        assertEquals("没有需要上报的事件", assertThrows(BusinessException.class, () -> service.batch(7L, List.of())).getMsg());
        assertEquals("没有需要上报的事件", assertThrows(BusinessException.class, () -> service.batch(7L, null)).getMsg());
        verify(statEventMapper, never()).insert(any(UserStatEvent.class));
    }

    @Test
    void oneInvalidEventRejectsTheWholeBatch() {
        BusinessException invalid = assertThrows(BusinessException.class, () -> service.batch(7L, List.of(
                event("e1", "play", 1L, null, null, null),
                event("e2", "unknown-type", 1L, null, null, null))));

        assertEquals(400, invalid.getCode());
        assertEquals("事件类型不支持", invalid.getMsg());
        verify(statEventMapper, never()).insert(any(UserStatEvent.class));
    }

    @Test
    void summaryAggregatesCountsAndTopSongsBySeconds() {
        when(statEventMapper.selectList(any())).thenReturn(List.of(
                stored("a", "complete", 1L, 300),
                stored("b", "skip", 1L, 120),
                stored("c", "complete", 2L, 200),
                stored("d", "play", 3L, 0),
                stored("e", "error", 3L, 0),
                // 该曲已被删除，标题回退为「未知曲目」
                stored("f", "skip", 4L, 500)));
        when(songMapper.selectBatchIds(any())).thenReturn(List.of(
                song(1L, "霓虹海"), song(2L, "深夜电台"), song(3L, "赛博空间")));

        Map<String, Object> summary = service.summary(7L, 7);

        assertEquals(1L, asLong(summary.get("plays")));
        assertEquals(2L, asLong(summary.get("completes")));
        assertEquals(2L, asLong(summary.get("skips")));
        assertEquals(1L, asLong(summary.get("errors")));
        assertEquals(1120L, asLong(summary.get("seconds")));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> top = (List<Map<String, Object>>) summary.get("topSongs");
        assertEquals(4, top.size());
        // 按收听秒数倒序：已删除的第 4 首 500 秒排首位，标题回退为「未知曲目」
        assertEquals(4L, top.get(0).get("songId"));
        assertEquals(StatEventService.UNKNOWN_TITLE, top.get(0).get("title"));
        assertEquals(500L, asLong(top.get(0).get("seconds")));
        assertEquals(1L, top.get(1).get("songId"));
        assertEquals("霓虹海", top.get(1).get("title"));
        assertEquals(420L, asLong(top.get(1).get("seconds")));
        assertEquals(3L, top.get(3).get("songId"));
        assertEquals(0L, asLong(top.get(3).get("seconds")));
    }

    @Test
    void summaryTopsOutAtFiveSongsAndClampsTheWindow() {
        when(statEventMapper.selectList(any())).thenReturn(List.of(
                stored("a", "complete", 1L, 100),
                stored("b", "complete", 2L, 200),
                stored("c", "complete", 3L, 300),
                stored("d", "complete", 4L, 400),
                stored("e", "complete", 5L, 500),
                stored("f", "complete", 6L, 600)));
        when(songMapper.selectBatchIds(any())).thenReturn(List.of(
                song(1L, "一"), song(2L, "二"), song(3L, "三"), song(4L, "四"), song(5L, "五"), song(6L, "六")));

        Map<String, Object> summary = service.summary(7L, 365);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> top = (List<Map<String, Object>>) summary.get("topSongs");
        assertEquals(StatEventService.TOP_SONGS, top.size());
        assertEquals(6L, top.get(0).get("songId"));
        assertEquals(600L, asLong(top.get(0).get("seconds")));
    }

    @Test
    void emptyWindowYieldsZeroedSummaryWithoutSongLookup() {
        when(statEventMapper.selectList(any())).thenReturn(List.of());

        Map<String, Object> summary = service.summary(7L, null);

        assertEquals(0L, asLong(summary.get("plays")));
        assertEquals(0L, asLong(summary.get("seconds")));
        assertTrue(((List<?>) summary.get("topSongs")).isEmpty());
        verify(songMapper, never()).selectBatchIds(any());
    }

    private static long asLong(Object value) {
        return ((Number) value).longValue();
    }

    private static StatEventDTO event(String eventId, String type, Long songId, Integer duration,
                                      Integer position, Integer seconds) {
        StatEventDTO dto = new StatEventDTO();
        dto.setEventId(eventId);
        dto.setType(type);
        dto.setSongId(songId);
        dto.setDuration(duration);
        dto.setPosition(position);
        dto.setSeconds(seconds);
        dto.setAt(NOW);
        return dto;
    }

    private static UserStatEvent stored(String eventId, String type, Long songId, int seconds) {
        UserStatEvent row = new UserStatEvent();
        row.setUserId(7L);
        row.setEventId(eventId);
        row.setEventType(type);
        row.setSongId(songId);
        row.setSeconds(seconds);
        row.setOccurredAt(LocalDateTime.now().minusHours(1));
        return row;
    }

    private static Song song(Long id, String title) {
        Song song = new Song();
        song.setId(id);
        song.setTitle(title);
        song.setStatus(1);
        return song;
    }
}

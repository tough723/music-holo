package com.musicholo.service;

import com.musicholo.dto.StatEventDTO;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 收听事件的校验与时长折算规则。
 */
class StatEventRulesTest {

    private static final long NOW = 1_760_000_000_000L;

    @Test
    void normalizesACompleteEventWithFullDuration() {
        Map<String, Object> event = StatEventRules.normalizeEvent(event(" abc ", "COMPLETE", 7L, 210, 210, null, NOW), NOW);

        assertEquals("abc", event.get(StatEventRules.FIELD_EVENT_ID));
        assertEquals("complete", event.get(StatEventRules.FIELD_EVENT_TYPE));
        assertEquals(7L, event.get(StatEventRules.FIELD_SONG_ID));
        assertEquals(210, event.get(StatEventRules.FIELD_DURATION_SEC));
        assertEquals(210, event.get(StatEventRules.FIELD_POSITION_SEC));
        // 播完按整段时长计入收听
        assertEquals(210, event.get(StatEventRules.FIELD_SECONDS));
        assertEquals(LocalDateTime.class, event.get(StatEventRules.FIELD_OCCURRED_AT).getClass());
    }

    @Test
    void skipCountsUpToThePositionCut() {
        assertEquals(45, StatEventRules.normalizeEvent(event("a", "skip", 7L, 210, 45, null, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        // position 超过时长时收敛到时长，等价于 min(position, duration)
        assertEquals(210, StatEventRules.normalizeEvent(event("b", "skip", 7L, 210, 9999, null, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        // 没有 position 时退化为客户端自报秒数
        assertEquals(30, StatEventRules.normalizeEvent(event("c", "skip", 7L, 210, null, 30, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        assertEquals(0, StatEventRules.normalizeEvent(event("d", "skip", 7L, 210, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
    }

    @Test
    void playAndErrorNeverCountSeconds() {
        assertEquals(0, StatEventRules.normalizeEvent(event("a", "play", 7L, 210, 200, 200, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        assertEquals(0, StatEventRules.normalizeEvent(event("b", "error", 7L, 210, 200, 200, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        // complete 缺少时长时不猜测
        assertEquals(0, StatEventRules.normalizeEvent(event("c", "complete", 7L, null, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_SECONDS));
    }

    @Test
    void rejectsBlankOrOversizedEventId() {
        assertEquals("事件 id 不能为空",
                assertThrows(IllegalArgumentException.class,
                        () -> StatEventRules.normalizeEvent(event("   ", "play", 1L, null, null, null, NOW), NOW)).getMessage());
        assertEquals("事件 id 不能为空",
                assertThrows(IllegalArgumentException.class,
                        () -> StatEventRules.normalizeEvent(event(null, "play", 1L, null, null, null, NOW), NOW)).getMessage());
        assertEquals("事件 id 最长 64 个字符",
                assertThrows(IllegalArgumentException.class,
                        () -> StatEventRules.normalizeEvent(event("x".repeat(65), "play", 1L, null, null, null, NOW), NOW)).getMessage());

        // 恰好 64 个字符可以通过
        String id64 = "x".repeat(64);
        assertEquals(id64, StatEventRules.normalizeEvent(event(id64, "play", 1L, null, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_EVENT_ID));
    }

    @Test
    void rejectsUnknownEventType() {
        for (String type : Arrays.asList("pause", "PLAYING", "", null)) {
            assertThrows(IllegalArgumentException.class,
                    () -> StatEventRules.normalizeEvent(event("a", type, 1L, null, null, null, NOW), NOW));
        }
    }

    @Test
    void rejectsEventTimeOutsideTheAcceptanceWindow() {
        assertEquals("事件时间异常",
                assertThrows(IllegalArgumentException.class,
                        () -> StatEventRules.normalizeEvent(event("a", "play", 1L, null, null, null, 0L), NOW)).getMessage());
        assertEquals("事件时间异常",
                assertThrows(IllegalArgumentException.class,
                        () -> StatEventRules.normalizeEvent(event("a", "play", 1L, null, null, null, NOW - StatEventRules.MAX_AGE_MS - 1), NOW)).getMessage());
        assertEquals("事件时间异常",
                        assertThrows(IllegalArgumentException.class,
                                () -> StatEventRules.normalizeEvent(event("a", "play", 1L, null, null, null, NOW + StatEventRules.MAX_FUTURE_MS + 1), NOW)).getMessage());

        // 窗口边界内（含 180 天前、此刻、超前 24 小时）都接受
        assertEquals(0, StatEventRules.normalizeEvent(event("a", "play", 1L, null, null, null, NOW - StatEventRules.MAX_AGE_MS), NOW)
                .get(StatEventRules.FIELD_SECONDS));
        assertEquals(0, StatEventRules.normalizeEvent(event("b", "play", 1L, null, null, null, NOW + StatEventRules.MAX_FUTURE_MS), NOW)
                .get(StatEventRules.FIELD_SECONDS));
    }

    @Test
    void clampsDurationAndPositionIntoRange() {
        assertEquals(StatEventRules.MAX_DURATION_SEC, StatEventRules.normalizeEvent(event("a", "play", 1L, 999_999, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_DURATION_SEC));
        assertEquals(0, StatEventRules.normalizeEvent(event("b", "play", 1L, -20, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_DURATION_SEC));
        assertNull(StatEventRules.normalizeEvent(event("c", "play", 1L, null, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_DURATION_SEC));

        assertEquals(0, StatEventRules.clampPosition(-10, 200));
        assertEquals(200, StatEventRules.clampPosition(300, 200));
        // 时长未知时只保证非负
        assertEquals(300, StatEventRules.clampPosition(300, null));
        assertEquals(300, StatEventRules.clampPosition(300, 0));
        assertNull(StatEventRules.clampPosition(null, 200));
    }

    @Test
    void songIdIsOptional() {
        assertNull(StatEventRules.normalizeEvent(event("a", "play", null, null, null, null, NOW), NOW)
                .get(StatEventRules.FIELD_SONG_ID));
    }

    @Test
    void secondsHelperIsAvailableForCallers() {
        assertEquals(120, StatEventRules.seconds("complete", 120, 10, 0));
        assertEquals(10, StatEventRules.seconds("skip", 120, 10, 0));
        assertEquals(0, StatEventRules.seconds("play", 120, 10, 60));
    }

    private static StatEventDTO event(String eventId, String type, Long songId, Integer duration,
                                      Integer position, Integer seconds, Long at) {
        StatEventDTO dto = new StatEventDTO();
        dto.setEventId(eventId);
        dto.setType(type);
        dto.setSongId(songId);
        dto.setDuration(duration);
        dto.setPosition(position);
        dto.setSeconds(seconds);
        dto.setAt(at);
        return dto;
    }
}

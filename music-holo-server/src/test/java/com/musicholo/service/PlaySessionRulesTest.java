package com.musicholo.service;

import com.musicholo.dto.PlaySessionSaveDTO;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 播放会话快照的校验与归一化规则。
 */
class PlaySessionRulesTest {

    @Test
    void keepsQueueOrderAndDropsNullIds() {
        Map<String, Object> payload = PlaySessionRules.normalize(
                session(Arrays.asList(3L, null, 1L, 2L), 1L, 12.5, "loop", 1.25));

        assertEquals(List.of(3L, 1L, 2L), payload.get("queueIds"));
        assertEquals(1L, payload.get("currentSongId"));
        assertEquals(12.5, payload.get("position"));
        assertEquals("loop", payload.get("mode"));
        assertEquals(1.25, payload.get("playbackRate"));
        assertEquals(PlaySessionRules.VERSION, payload.get("version"));
    }

    @Test
    void acceptsEverySupportedModeCaseInsensitively() {
        for (String mode : List.of("order", "loop", "single", "random", "shuffle", "heart")) {
            Map<String, Object> payload = PlaySessionRules.normalize(session(List.of(1L), null, 0d, "  " + mode.toUpperCase() + " ", 1d));
            assertEquals(mode, payload.get("mode"));
        }
    }

    @Test
    void rejectsUnknownMode() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> PlaySessionRules.normalize(session(List.of(1L), null, 0d, "auto", 1d)));
        assertEquals("播放模式不支持", ex.getMessage());
    }

    @Test
    void blankModeFallsBackToOrderAndMissingRateToOne() {
        Map<String, Object> payload = PlaySessionRules.normalize(session(List.of(1L), null, null, "  ", null));

        assertEquals("order", payload.get("mode"));
        assertEquals(1.0, payload.get("playbackRate"));
        assertEquals(0d, payload.get("position"));
    }

    @Test
    void acceptsEverySupportedRateAndRejectsOthers() {
        for (Double rate : List.of(0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)) {
            assertEquals(rate, PlaySessionRules.normalize(session(List.of(1L), null, 0d, "order", rate)).get("playbackRate"));
        }
        for (Double rate : List.of(0d, 0.9, 1.1, 2.5, -1d)) {
            assertThrows(IllegalArgumentException.class,
                    () -> PlaySessionRules.normalize(session(List.of(1L), null, 0d, "order", rate)));
        }
        assertThrows(IllegalArgumentException.class,
                () -> PlaySessionRules.normalize(session(List.of(1L), null, 0d, "order", Double.NaN)));
    }

    @Test
    void emptyQueueIsRejectedButNullEntriesAreIgnored() {
        assertEquals("队列不能为空",
                assertThrows(IllegalArgumentException.class, () -> PlaySessionRules.normalize(session(List.of(), null, 0d, "order", 1d))).getMessage());
        assertEquals("队列不能为空",
                assertThrows(IllegalArgumentException.class, () -> PlaySessionRules.normalize(session(null, null, 0d, "order", 1d))).getMessage());
        assertEquals("队列不能为空",
                assertThrows(IllegalArgumentException.class, () -> PlaySessionRules.normalize(session(Arrays.asList(null, null), null, 0d, "order", 1d))).getMessage());
    }

    @Test
    void queueIsCappedAtFiveHundredSongs() {
        List<Long> full = new ArrayList<>();
        for (long i = 1; i <= PlaySessionRules.MAX_QUEUE; i++) {
            full.add(i);
        }
        assertEquals(PlaySessionRules.MAX_QUEUE,
                PlaySessionRules.normalizeQueue(full).size());

        full.add(999L);
        assertEquals("队列最多 500 首",
                assertThrows(IllegalArgumentException.class, () -> PlaySessionRules.normalize(session(full, 1L, 0d, "order", 1d))).getMessage());
    }

    @Test
    void currentSongMustBelongToTheQueue() {
        assertEquals("当前曲目不在队列中",
                assertThrows(IllegalArgumentException.class,
                        () -> PlaySessionRules.normalize(session(List.of(1L, 2L), 3L, 0d, "order", 1d))).getMessage());

        Map<String, Object> payload = PlaySessionRules.normalize(session(List.of(1L, 2L), null, 3d, "order", 1d));
        assertNull(payload.get("currentSongId"));
    }

    @Test
    void positionNeverGoesNegativeOrNonFinite() {
        assertEquals(0d, PlaySessionRules.normalizePosition(-4.5));
        assertEquals(0d, PlaySessionRules.normalizePosition(Double.NaN));
        assertEquals(0d, PlaySessionRules.normalizePosition(Double.POSITIVE_INFINITY));
        assertEquals(0d, PlaySessionRules.normalizePosition(null));
        assertEquals(12.5, PlaySessionRules.normalizePosition(12.5));
        assertEquals(0d, PlaySessionRules.normalizePosition(0d));
    }

    @Test
    void exposesSevenDayRetentionAndWhitelists() {
        assertEquals(7L * 24 * 60 * 60 * 1000, PlaySessionRules.TTL_MS);
        assertEquals(6, PlaySessionRules.MODES.size());
        assertTrue(PlaySessionRules.RATES.contains(1.75));
        assertThrows(IllegalArgumentException.class, () -> PlaySessionRules.normalize(null));
    }

    private static PlaySessionSaveDTO session(List<Long> queueIds, Long currentSongId, Double position, String mode, Double rate) {
        PlaySessionSaveDTO dto = new PlaySessionSaveDTO();
        dto.setQueueIds(queueIds);
        dto.setCurrentSongId(currentSongId);
        dto.setPosition(position);
        dto.setMode(mode);
        dto.setPlaybackRate(rate);
        return dto;
    }
}

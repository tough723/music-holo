package com.musicholo.service;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PlaylistOrderTest {

    @Test
    void movesOneStepUpOrDown() {
        assertEquals(List.of(2L, 1L, 7L), PlaylistOrder.move(List.of(1L, 2L, 7L), 2L, -1));
        assertEquals(List.of(1L, 7L, 2L), PlaylistOrder.move(List.of(1L, 2L, 7L), 2L, 1));
    }

    @Test
    void boundaryMoveKeepsTheCurrentOrder() {
        List<Long> order = List.of(1L, 2L, 7L);
        assertEquals(order, PlaylistOrder.move(order, 1L, -1));
        assertEquals(order, PlaylistOrder.move(order, 7L, 1));
        assertEquals(List.of(4L), PlaylistOrder.move(List.of(4L), 4L, -1));
        assertEquals(List.of(4L), PlaylistOrder.move(List.of(4L), 4L, 1));
    }

    @Test
    void rejectsMissingSongAndInvalidDirection() {
        assertThrows(PlaylistOrder.NotInListException.class,
                () -> PlaylistOrder.move(List.of(1L, 2L), 9L, 1));
        assertThrows(IllegalArgumentException.class,
                () -> PlaylistOrder.move(List.of(1L, 2L), 1L, 0));
        assertThrows(IllegalArgumentException.class,
                () -> PlaylistOrder.move(List.of(1L, 2L), 1L, 2));
        assertThrows(IllegalArgumentException.class,
                () -> PlaylistOrder.move(List.of(1L), null, -1));
    }

    @Test
    void movesOnlyTheFirstOccurrenceWhenIdsRepeat() {
        assertEquals(List.of(2L, 1L, 1L), PlaylistOrder.move(List.of(1L, 2L, 1L), 1L, 1));
    }
}

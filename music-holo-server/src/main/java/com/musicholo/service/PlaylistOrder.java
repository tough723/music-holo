package com.musicholo.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 歌单曲目顺序的纯计算。只交换已排序列表中的相邻项，不访问数据库。
 */
public final class PlaylistOrder {

    private PlaylistOrder() {
    }

    /**
     * 歌曲不在当前顺序中。
     */
    public static class NotInListException extends IllegalArgumentException {

        public NotInListException() {
            super("歌曲不在歌单中");
        }
    }

    /**
     * 将 songId 上移或下移一位。direction 只能是 -1 或 1。
     * 已经在边界时返回原顺序，不抛错。
     */
    public static List<Long> move(List<Long> songIds, Long songId, int direction) {
        if (songIds == null) {
            throw new IllegalArgumentException("songIds");
        }
        if (direction != -1 && direction != 1) {
            throw new IllegalArgumentException("direction");
        }
        if (songId == null) {
            throw new IllegalArgumentException("songId");
        }
        int index = indexOf(songIds, songId);
        if (index < 0) {
            throw new NotInListException();
        }
        List<Long> next = new ArrayList<>(songIds);
        int target = index + direction;
        if (target < 0 || target >= next.size()) {
            return List.copyOf(next);
        }
        Collections.swap(next, index, target);
        return List.copyOf(next);
    }

    static int indexOf(List<Long> songIds, Long songId) {
        for (int i = 0; i < songIds.size(); i++) {
            if (songId.equals(songIds.get(i))) {
                return i;
            }
        }
        return -1;
    }
}

package com.musicholo.service;

import com.musicholo.entity.Song;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * 某个账号当前生效的不喜欢歌曲/歌手 id。匿名或未设置时使用空规则。
 */
public final class DislikeRules {

    private final Set<Long> songIds;
    private final Set<Long> singerIds;

    private DislikeRules(Set<Long> songIds, Set<Long> singerIds) {
        this.songIds = songIds;
        this.singerIds = singerIds;
    }

    public static DislikeRules empty() {
        return new DislikeRules(Set.of(), Set.of());
    }

    public static DislikeRules of(Set<Long> songIds, Set<Long> singerIds) {
        return new DislikeRules(copy(songIds), copy(singerIds));
    }

    private static Set<Long> copy(Set<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Set.of();
        }
        Set<Long> copy = new HashSet<>();
        for (Long id : ids) {
            if (id != null) {
                copy.add(id);
            }
        }
        return copy.isEmpty() ? Set.of() : Collections.unmodifiableSet(copy);
    }

    public Set<Long> songIds() {
        return songIds;
    }

    public Set<Long> singerIds() {
        return singerIds;
    }

    public boolean isEmpty() {
        return songIds.isEmpty() && singerIds.isEmpty();
    }

    public boolean matchesSong(Long songId) {
        return songId != null && songIds.contains(songId);
    }

    public boolean matchesSinger(Long singerId) {
        return singerId != null && singerIds.contains(singerId);
    }

    public boolean matches(Song song) {
        if (song == null) {
            return false;
        }
        return matchesSong(song.getId()) || matchesSinger(song.getSingerId());
    }
}

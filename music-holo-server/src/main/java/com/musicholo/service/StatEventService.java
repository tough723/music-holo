package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.musicholo.common.Result;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.StatEventDTO;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserStatEvent;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserStatEventMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 收听统计：客户端批量上报事件（幂等），汇总按账号 + 时间窗在内存中折算。
 * <p>
 * 事件表只保留 90 天（清理 SQL 见 sql/migration_20261011_stat_event.sql），
 * 因此汇总窗口最大 90 天，超出直接收敛。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StatEventService {

    /** 单次批量上报上限 */
    public static final int MAX_BATCH = 200;

    /** 汇总窗口上限（天），与事件保留期一致 */
    public static final int MAX_DAYS = 90;

    /** 汇总窗口默认天数 */
    public static final int DEFAULT_DAYS = 7;

    /** 热门曲目条数 */
    public static final int TOP_SONGS = 5;

    /** 曲目已被删除时的占位标题 */
    public static final String UNKNOWN_TITLE = "未知曲目";

    private final UserStatEventMapper statEventMapper;
    private final SongMapper songMapper;

    /**
     * 批量接收事件：先归一化再按 (user_id, event_id) 去重，返回新增与重复条数。
     */
    public Map<String, Object> batch(Long userId, List<StatEventDTO> items) {
        if (items == null || items.isEmpty()) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "没有需要上报的事件");
        }
        if (items.size() > MAX_BATCH) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, "批量上报最多 " + MAX_BATCH + " 条");
        }

        // 1. 归一化（任意一条不合法整批拒绝，客户端可直接重试）
        List<UserStatEvent> events = new ArrayList<>(items.size());
        for (StatEventDTO item : items) {
            events.add(toRow(userId, normalize(item)));
        }

        // 2. 与库中已有事件比对，同时剔除本批次内重复的 eventId
        Set<String> submitted = new LinkedHashSet<>();
        for (UserStatEvent event : events) {
            submitted.add(event.getEventId());
        }
        Set<String> existing = existingEventIds(userId, submitted);

        int accepted = 0;
        int duplicates = 0;
        Set<String> seen = new HashSet<>();
        for (UserStatEvent event : events) {
            if (existing.contains(event.getEventId()) || !seen.add(event.getEventId())) {
                duplicates++;
                continue;
            }
            try {
                statEventMapper.insert(event);
                accepted++;
            } catch (DuplicateKeyException ex) {
                // 并发重复上报：唯一键兜底，按重复计数。
                duplicates++;
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accepted", accepted);
        result.put("duplicates", duplicates);
        return result;
    }

    /**
     * 最近 days 天的收听汇总：各类型次数、累计收听秒数，以及收听时长最高的 5 首曲目。
     */
    public Map<String, Object> summary(Long userId, Integer days) {
        int window = days == null ? DEFAULT_DAYS : Math.max(1, Math.min(days, MAX_DAYS));
        LocalDateTime since = LocalDateTime.now().minusDays(window);
        List<UserStatEvent> events = statEventMapper.selectList(new LambdaQueryWrapper<UserStatEvent>()
                .eq(UserStatEvent::getUserId, userId)
                .ge(UserStatEvent::getOccurredAt, since));

        long plays = 0;
        long completes = 0;
        long skips = 0;
        long errors = 0;
        long seconds = 0;
        Map<Long, Long> secondsBySong = new LinkedHashMap<>();
        Set<Long> contributing = new LinkedHashSet<>();
        for (UserStatEvent event : events) {
            String type = event.getEventType();
            if (StatEventRules.TYPE_PLAY.equals(type)) {
                plays++;
            } else if (StatEventRules.TYPE_COMPLETE.equals(type)) {
                completes++;
            } else if (StatEventRules.TYPE_SKIP.equals(type)) {
                skips++;
            } else if (StatEventRules.TYPE_ERROR.equals(type)) {
                errors++;
            } else {
                continue;
            }
            seconds += event.getSeconds() == null ? 0 : event.getSeconds();
            if (StatEventRules.TYPE_PLAY.equals(type)
                    || StatEventRules.TYPE_COMPLETE.equals(type)
                    || StatEventRules.TYPE_SKIP.equals(type)) {
                // songId 为 null 的事件也计入，统一落到「未知曲目」
                contributing.add(event.getSongId());
                secondsBySong.merge(event.getSongId(), (long) (event.getSeconds() == null ? 0 : event.getSeconds()), Long::sum);
            }
        }

        Map<Long, String> titles = loadTitles(contributing);
        List<Map<String, Object>> topSongs = secondsBySong.entrySet().stream()
                .sorted(Comparator.comparingLong((Map.Entry<Long, Long> entry) -> entry.getValue()).reversed()
                        .thenComparing(entry -> entry.getKey() == null ? Long.MAX_VALUE : entry.getKey()))
                .limit(TOP_SONGS)
                .map(entry -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("songId", entry.getKey());
                    item.put("title", titles.getOrDefault(entry.getKey(), UNKNOWN_TITLE));
                    item.put("seconds", entry.getValue());
                    return item;
                })
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("plays", plays);
        result.put("completes", completes);
        result.put("skips", skips);
        result.put("errors", errors);
        result.put("seconds", seconds);
        result.put("topSongs", topSongs);
        return result;
    }

    /**
     * 归一化一条事件，把规则层的参数错误转换成 400。
     */
    private Map<String, Object> normalize(StatEventDTO item) {
        try {
            return StatEventRules.normalizeEvent(item);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(Result.CODE_BAD_REQUEST, ex.getMessage());
        }
    }

    private static UserStatEvent toRow(Long userId, Map<String, Object> event) {
        UserStatEvent row = new UserStatEvent();
        row.setUserId(userId);
        row.setEventId((String) event.get(StatEventRules.FIELD_EVENT_ID));
        row.setEventType((String) event.get(StatEventRules.FIELD_EVENT_TYPE));
        row.setSongId((Long) event.get(StatEventRules.FIELD_SONG_ID));
        row.setDurationSec((Integer) event.get(StatEventRules.FIELD_DURATION_SEC));
        row.setPositionSec((Integer) event.get(StatEventRules.FIELD_POSITION_SEC));
        row.setSeconds((Integer) event.get(StatEventRules.FIELD_SECONDS));
        row.setOccurredAt((LocalDateTime) event.get(StatEventRules.FIELD_OCCURRED_AT));
        return row;
    }

    /**
     * 查询本批次中账号下已存在的 event_id。
     */
    private Set<String> existingEventIds(Long userId, Set<String> eventIds) {
        if (eventIds.isEmpty()) {
            return Set.of();
        }
        Set<String> existing = new HashSet<>();
        for (UserStatEvent row : statEventMapper.selectList(new LambdaQueryWrapper<UserStatEvent>()
                .eq(UserStatEvent::getUserId, userId)
                .in(UserStatEvent::getEventId, eventIds)
                .select(UserStatEvent::getEventId))) {
            if (row != null && row.getEventId() != null) {
                existing.add(row.getEventId());
            }
        }
        return existing;
    }

    /**
     * 补齐曲目标题；歌曲已删除或 songId 为空时不落 map，由调用方给出「未知曲目」。
     */
    private Map<Long, String> loadTitles(Set<Long> songIds) {
        // 始终返回可变 map：songId 可能为 null，Map.of() 对 null 键会抛 NPE。
        Map<Long, String> titles = new LinkedHashMap<>();
        List<Long> ids = songIds.stream().filter(id -> id != null).distinct().toList();
        if (ids.isEmpty()) {
            return titles;
        }
        for (Song song : songMapper.selectBatchIds(ids)) {
            if (song != null && song.getId() != null) {
                titles.put(song.getId(), song.getTitle() == null || song.getTitle().isBlank() ? UNKNOWN_TITLE : song.getTitle());
            }
        }
        return titles;
    }
}

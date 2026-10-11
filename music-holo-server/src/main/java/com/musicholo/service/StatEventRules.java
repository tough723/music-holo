package com.musicholo.service;

import com.musicholo.dto.StatEventDTO;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 收听事件的纯校验与折算：只做参数归一化，不访问数据库，便于单元测试。
 * <p>
 * 折算口径（汇总只认 seconds 这一列）：
 * <ul>
 *   <li>complete：记满整段时长 duration；</li>
 *   <li>skip：记到切走时的位置（position 已按 duration 收敛）；</li>
 *   <li>play / error：不记时长。</li>
 * </ul>
 * 规则不通过时统一抛出 {@link IllegalArgumentException}（中文提示），由服务层转换成 400 业务异常。
 */
public final class StatEventRules {

    /** 幂等键最大长度，与 user_stat_event.event_id 一致 */
    public static final int MAX_EVENT_ID_LENGTH = 64;

    /** 允许的事件类型 */
    public static final Set<String> TYPES = Set.of("play", "skip", "complete", "error");

    /** 事件时长上限：一小时；超出视为脏数据 */
    public static final int MAX_DURATION_SEC = 3600;

    /** 允许的最久过去时间：更早的事件一律拒收 */
    public static final long MAX_AGE_MS = 180L * 24 * 60 * 60 * 1000;

    /** 允许的客户端时钟超前量 */
    public static final long MAX_FUTURE_MS = 24L * 60 * 60 * 1000;

    /** 事件类型 */
    public static final String TYPE_PLAY = "play";
    public static final String TYPE_SKIP = "skip";
    public static final String TYPE_COMPLETE = "complete";
    public static final String TYPE_ERROR = "error";

    /** 归一化结果的键名 */
    public static final String FIELD_EVENT_ID = "eventId";
    public static final String FIELD_EVENT_TYPE = "eventType";
    public static final String FIELD_SONG_ID = "songId";
    public static final String FIELD_DURATION_SEC = "durationSec";
    public static final String FIELD_POSITION_SEC = "positionSec";
    public static final String FIELD_SECONDS = "seconds";
    public static final String FIELD_OCCURRED_AT = "occurredAt";

    private StatEventRules() {
    }

    /**
     * 以服务器当前时间为基准归一化一条事件。
     */
    public static Map<String, Object> normalizeEvent(StatEventDTO dto) {
        return normalizeEvent(dto, System.currentTimeMillis());
    }

    /**
     * 校验并归一化一条事件，返回待落库的字段（id / userId 由服务层补齐）。
     *
     * @param nowEpochMs 服务器当前时间，用于限制事件时间窗口
     */
    public static Map<String, Object> normalizeEvent(StatEventDTO dto, long nowEpochMs) {
        if (dto == null) {
            throw new IllegalArgumentException("事件不能为空");
        }
        String eventId = dto.getEventId() == null ? "" : dto.getEventId().trim();
        if (eventId.isEmpty()) {
            throw new IllegalArgumentException("事件 id 不能为空");
        }
        if (eventId.length() > MAX_EVENT_ID_LENGTH) {
            throw new IllegalArgumentException("事件 id 最长 64 个字符");
        }
        String type = dto.getType() == null ? "" : dto.getType().trim().toLowerCase(Locale.ROOT);
        if (!TYPES.contains(type)) {
            throw new IllegalArgumentException("事件类型不支持");
        }
        long at = dto.getAt() == null ? 0L : dto.getAt();
        if (at <= 0 || at < nowEpochMs - MAX_AGE_MS || at > nowEpochMs + MAX_FUTURE_MS) {
            throw new IllegalArgumentException("事件时间异常");
        }

        Integer duration = clampDuration(dto.getDuration());
        Integer position = clampPosition(dto.getPosition(), duration);
        int seconds = seconds(type, duration, position, clampDuration(dto.getSeconds()));

        Map<String, Object> event = new LinkedHashMap<>();
        event.put(FIELD_EVENT_ID, eventId);
        event.put(FIELD_EVENT_TYPE, type);
        event.put(FIELD_SONG_ID, dto.getSongId());
        event.put(FIELD_DURATION_SEC, duration);
        event.put(FIELD_POSITION_SEC, position);
        event.put(FIELD_SECONDS, seconds);
        event.put(FIELD_OCCURRED_AT, LocalDateTime.ofInstant(Instant.ofEpochMilli(at), ZoneId.systemDefault()));
        return event;
    }

    /**
     * 时长折算：complete 记满时长，skip 记到切走位置，play / error 不记时长。
     */
    public static int seconds(String type, Integer duration, Integer position, Integer reportedSeconds) {
        if (TYPE_COMPLETE.equals(type)) {
            return duration == null ? 0 : duration;
        }
        if (TYPE_SKIP.equals(type)) {
            if (position != null) {
                // position 已按 duration 收敛，等价于 min(position, duration)
                return position;
            }
            return reportedSeconds == null ? 0 : reportedSeconds;
        }
        return 0;
    }

    /**
     * 时长归一化：负数、超一小时的脏数据分别压到 0 与 3600；未上报保持 null。
     */
    public static Integer clampDuration(Integer value) {
        if (value == null) {
            return null;
        }
        return Math.max(0, Math.min(MAX_DURATION_SEC, value));
    }

    /**
     * 播放位置归一化：已知时长时不超过时长，否则只保证非负。
     */
    public static Integer clampPosition(Integer value, Integer duration) {
        if (value == null) {
            return null;
        }
        int position = Math.max(0, value);
        if (duration != null && duration > 0) {
            position = Math.min(position, duration);
        }
        return position;
    }
}

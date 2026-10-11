package com.musicholo.service;

import com.musicholo.dto.PlaySessionSaveDTO;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 播放会话快照的纯校验与归一化：只看参数，不访问 Redis 和数据库，便于单元测试。
 * <p>
 * 规则不通过时统一抛出 {@link IllegalArgumentException}（中文提示），由服务层转换成 400 业务异常。
 */
public final class PlaySessionRules {

    /** 快照结构版本；字段含义变化时递增，客户端按版本兼容读取 */
    public static final int VERSION = 1;

    /** 快照保留时长：7 天 */
    public static final long TTL_MS = 7L * 24 * 60 * 60 * 1000;

    /** 队列长度上限，超出直接拒绝，避免把失控的队列写进 Redis */
    public static final int MAX_QUEUE = 500;

    /** 允许的播放模式 */
    public static final Set<String> MODES = Set.of("order", "loop", "single", "random", "shuffle", "heart");

    /** 允许的播放倍速 */
    public static final Set<Double> RATES = Set.of(0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0);

    /** 未上报模式时的默认值 */
    public static final String DEFAULT_MODE = "order";

    /** 未上报倍速时的默认值 */
    public static final double DEFAULT_RATE = 1.0;

    private PlaySessionRules() {
    }

    /**
     * 校验并归一化一次会话上报，返回待写入 Redis 的载荷（不含 savedAt / expiresAt，由服务层补齐）。
     */
    public static Map<String, Object> normalize(PlaySessionSaveDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("播放会话不能为空");
        }
        List<Long> queueIds = normalizeQueue(dto.getQueueIds());

        Long currentSongId = dto.getCurrentSongId();
        if (currentSongId != null && !queueIds.contains(currentSongId)) {
            throw new IllegalArgumentException("当前曲目不在队列中");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", VERSION);
        payload.put("queueIds", queueIds);
        payload.put("currentSongId", currentSongId);
        payload.put("position", normalizePosition(dto.getPosition()));
        payload.put("mode", normalizeMode(dto.getMode()));
        payload.put("playbackRate", normalizeRate(dto.getPlaybackRate()));
        return payload;
    }

    /**
     * 队列：丢弃 null 元素，保持原有顺序，非空且不超过 {@link #MAX_QUEUE}。
     */
    public static List<Long> normalizeQueue(List<Long> queueIds) {
        List<Long> cleaned = new ArrayList<>();
        if (queueIds != null) {
            for (Long id : queueIds) {
                if (id != null) {
                    cleaned.add(id);
                }
            }
        }
        if (cleaned.isEmpty()) {
            throw new IllegalArgumentException("队列不能为空");
        }
        if (cleaned.size() > MAX_QUEUE) {
            throw new IllegalArgumentException("队列最多 " + MAX_QUEUE + " 首");
        }
        return cleaned;
    }

    /**
     * 播放进度：非法（NaN / Infinity）或负数一律归零。
     */
    public static double normalizePosition(Double position) {
        if (position == null || !Double.isFinite(position) || position < 0) {
            return 0d;
        }
        return position;
    }

    /**
     * 播放模式：只接受白名单内的模式，缺省按顺序播放。
     */
    public static String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return DEFAULT_MODE;
        }
        String key = mode.trim().toLowerCase(Locale.ROOT);
        if (!MODES.contains(key)) {
            throw new IllegalArgumentException("播放模式不支持");
        }
        return key;
    }

    /**
     * 播放倍速：只接受白名单内的倍速，缺省 1 倍速。
     */
    public static double normalizeRate(Double playbackRate) {
        if (playbackRate == null) {
            return DEFAULT_RATE;
        }
        if (!Double.isFinite(playbackRate) || !RATES.contains(playbackRate)) {
            throw new IllegalArgumentException("播放倍速不支持");
        }
        return playbackRate;
    }
}

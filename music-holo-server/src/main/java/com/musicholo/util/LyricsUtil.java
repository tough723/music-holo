package com.musicholo.util;

import cn.hutool.core.util.StrUtil;
import com.musicholo.vo.LyricLine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 歌词工具：LRC 格式解析与导出
 * <p>
 * 支持标准 LRC 时间标签，如 [00:12.34]、[00:12.345]、[00:12]；
 * 一行多个时间标签（如 [00:01.00][00:10.00]歌词）会拆成多行。
 */
public class LyricsUtil {

    /** 时间标签：[mm:ss] / [mm:ss.xx] / [mm:ss.xxx] */
    private static final Pattern TIME_TAG = Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");

    /** 元信息标签（作词、作曲等），如 [ti:标题] */
    private static final Pattern META_TAG = Pattern.compile("\\[(?:ti|ar|al|by|offset):.*?\\]", Pattern.CASE_INSENSITIVE);

    private LyricsUtil() {
    }

    /**
     * 解析 LRC 歌词文本为按时间升序的歌词行列表
     */
    public static List<LyricLine> parse(String lrc) {
        List<LyricLine> lines = new ArrayList<>();
        if (StrUtil.isBlank(lrc)) {
            return lines;
        }
        for (String rawLine : lrc.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }
            // 跳过元信息行
            if (META_TAG.matcher(line).matches()) {
                continue;
            }
            Matcher matcher = TIME_TAG.matcher(line);
            List<Double> times = new ArrayList<>();
            int lastEnd = 0;
            while (matcher.find()) {
                times.add(toSeconds(matcher));
                lastEnd = matcher.end();
            }
            if (times.isEmpty()) {
                // 无时间标签的普通文本行，默认归到 0 秒
                String text = line.replaceAll("\\[.*?\\]", "").trim();
                if (StrUtil.isNotBlank(text)) {
                    lines.add(new LyricLine(0.0, text));
                }
                continue;
            }
            String text = line.substring(lastEnd).trim();
            for (Double time : times) {
                lines.add(new LyricLine(time, text));
            }
        }
        lines.sort(Comparator.comparing(LyricLine::getTime));
        return lines;
    }

    /**
     * 将歌词行列表格式化为标准 LRC 文本（[mm:ss.xx] 两位小数）
     */
    public static String toLrc(List<LyricLine> lines) {
        StringBuilder sb = new StringBuilder();
        if (lines == null) {
            return "";
        }
        List<LyricLine> sorted = new ArrayList<>(lines);
        sorted.sort(Comparator.comparing(LyricLine::getTime));
        for (LyricLine line : sorted) {
            sb.append(formatTimeTag(line.getTime())).append(line.getText() == null ? "" : line.getText()).append('\n');
        }
        return sb.toString();
    }

    /**
     * 将匹配到的时间标签换算为秒
     */
    private static double toSeconds(Matcher matcher) {
        long minutes = Long.parseLong(matcher.group(1));
        long seconds = Long.parseLong(matcher.group(2));
        double fraction = 0d;
        String frac = matcher.group(3);
        if (StrUtil.isNotBlank(frac)) {
            // 统一按小数处理：[00:01.5] = 1.5 秒，[00:01.50] = 1.50 秒，[00:01.500] = 1.500 秒
            fraction = Double.parseDouble("0." + frac);
        }
        return minutes * 60 + seconds + fraction;
    }

    /**
     * 秒 -> [mm:ss.xx] 标签
     */
    public static String formatTimeTag(Double seconds) {
        double safe = seconds == null ? 0d : Math.max(0d, seconds);
        long totalCentis = Math.round(safe * 100);
        long minutes = totalCentis / 6000;
        long secs = (totalCentis % 6000) / 100;
        long centis = totalCentis % 100;
        return String.format("[%02d:%02d.%02d]", minutes, secs, centis);
    }
}

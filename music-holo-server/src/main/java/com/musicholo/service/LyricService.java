package com.musicholo.service;

import cn.hutool.core.util.CharsetUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SongMapper;
import com.musicholo.util.LyricsUtil;
import com.musicholo.vo.LyricVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * 歌词服务：LRC 解析、歌词/译文导出、歌词保存 / 上传
 */
@Service
@RequiredArgsConstructor
public class LyricService {

    private static final int MAX_LRC_BYTES = 65_535;
    private static final String ORIGINAL = "original";
    private static final String TRANSLATION = "translation";

    private final SongMapper songMapper;

    /** 解析原歌词及可选译文为按时间升序排列的结构化歌词行。 */
    public LyricVO parse(Long songId) {
        Song song = getSong(songId);
        LyricVO vo = new LyricVO();
        vo.setSongId(songId);
        vo.setTitle(song.getTitle());
        vo.setLines(LyricsUtil.parse(song.getLyric()));
        vo.setTranslationLines(LyricsUtil.parse(song.getLyricTranslation()));
        return vo;
    }

    /** 导出原歌词或译文为 .lrc 文件下载。 */
    public void export(Long songId, String variant, HttpServletResponse response) throws IOException {
        Song song = getSong(songId);
        String lyricText = lyricTextFor(song, variant);
        String content = LyricsUtil.toLrc(LyricsUtil.parse(lyricText));
        response.setContentType("text/plain;charset=UTF-8");
        String suffix = TRANSLATION.equals(normalizeVariant(variant)) ? ".translation" : "";
        String fileName = URLEncoder.encode(song.getTitle() + suffix + ".lrc", StandardCharsets.UTF_8);
        response.setHeader("Content-Disposition", "attachment;filename*=UTF-8''" + fileName);
        response.getWriter().write(content);
        response.getWriter().flush();
    }

    /** 保存任一非 null 歌词字段；空字符串可用于显式清空。 */
    public void save(Long songId, String lyric, String lyricTranslation) {
        getSong(songId);
        validateLrcSize(lyric);
        validateLrcSize(lyricTranslation);

        LambdaUpdateWrapper<Song> update = new LambdaUpdateWrapper<Song>().eq(Song::getId, songId);
        if (lyric != null) update.set(Song::getLyric, lyric);
        if (lyricTranslation != null) update.set(Song::getLyricTranslation, lyricTranslation);
        if (lyric != null || lyricTranslation != null) songMapper.update(null, update);
    }

    /** 上传 .lrc / .txt 原歌词或译文，覆盖对应字段。 */
    public void upload(Long songId, MultipartFile file, String variant) throws IOException {
        getSong(songId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException("上传文件不能为空");
        }
        if (file.getSize() > MAX_LRC_BYTES) {
            throw new BusinessException("单份 LRC 文本不能超过 64 KB");
        }
        String normalizedVariant = normalizeVariant(variant);
        String original = file.getOriginalFilename();
        String ext = original == null ? "" : original.substring(original.lastIndexOf('.') + 1).toLowerCase();
        if (!"lrc".equals(ext) && !"txt".equals(ext)) {
            throw new BusinessException("仅支持 .lrc / .txt 歌词文件");
        }
        // 优先 UTF-8，失败回退 GBK（兼容 Windows 记事本保存的歌词）
        byte[] bytes = file.getBytes();
        String content = new String(bytes, StandardCharsets.UTF_8);
        if (StrUtil.isBlank(content) || content.contains("\uFFFD")) {
            content = new String(bytes, Charset.forName(CharsetUtil.GBK));
        }
        if (TRANSLATION.equals(normalizedVariant)) save(songId, null, content);
        else save(songId, content, null);
    }

    private String lyricTextFor(Song song, String variant) {
        return switch (normalizeVariant(variant)) {
            case ORIGINAL -> song.getLyric();
            case TRANSLATION -> song.getLyricTranslation();
            default -> throw new BusinessException("歌词类型无效");
        };
    }

    private String normalizeVariant(String variant) {
        String value = StrUtil.isBlank(variant) ? ORIGINAL : variant.trim().toLowerCase(Locale.ROOT);
        if (!ORIGINAL.equals(value) && !TRANSLATION.equals(value)) {
            throw new BusinessException("歌词类型无效");
        }
        return value;
    }

    private void validateLrcSize(String lrc) {
        if (lrc != null && lrc.getBytes(StandardCharsets.UTF_8).length > MAX_LRC_BYTES) {
            throw new BusinessException("单份 LRC 文本不能超过 64 KB");
        }
    }

    private Song getSong(Long songId) {
        Song song = songMapper.selectById(songId);
        if (song == null) {
            throw new BusinessException("歌曲不存在");
        }
        return song;
    }
}

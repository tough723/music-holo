package com.musicholo.service;

import cn.hutool.core.util.CharsetUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SongMapper;
import com.musicholo.util.LyricsUtil;
import com.musicholo.vo.LyricLine;
import com.musicholo.vo.LyricVO;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 歌词服务：LRC 解析、歌词导出、歌词保存 / 上传
 */
@Service
@RequiredArgsConstructor
public class LyricService {

    private final SongMapper songMapper;

    /**
     * 解析歌曲歌词为结构化歌词行（按时间升序）
     */
    public LyricVO parse(Long songId) {
        Song song = getSong(songId);
        LyricVO vo = new LyricVO();
        vo.setSongId(songId);
        vo.setTitle(song.getTitle());
        vo.setLines(LyricsUtil.parse(song.getLyric()));
        return vo;
    }

    /**
     * 导出歌曲歌词为 .lrc 文件下载
     */
    public void export(Long songId, HttpServletResponse response) throws IOException {
        Song song = getSong(songId);
        List<LyricLine> lines = LyricsUtil.parse(song.getLyric());
        String content = LyricsUtil.toLrc(lines);
        response.setContentType("text/plain;charset=UTF-8");
        String fileName = URLEncoder.encode(song.getTitle() + ".lrc", StandardCharsets.UTF_8);
        response.setHeader("Content-Disposition", "attachment;filename*=UTF-8''" + fileName);
        response.getWriter().write(content);
        response.getWriter().flush();
    }

    /**
     * 保存（覆盖）歌曲歌词文本
     */
    public void save(Long songId, String lyric) {
        getSong(songId);
        songMapper.update(null, new LambdaUpdateWrapper<Song>()
                .eq(Song::getId, songId)
                .set(Song::getLyric, lyric == null ? "" : lyric));
    }

    /**
     * 上传 .lrc / .txt 歌词文件，覆盖歌曲歌词
     */
    public void upload(Long songId, MultipartFile file) throws IOException {
        getSong(songId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException("上传文件不能为空");
        }
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
        save(songId, content);
    }

    private Song getSong(Long songId) {
        Song song = songMapper.selectById(songId);
        if (song == null) {
            throw new BusinessException("歌曲不存在");
        }
        return song;
    }
}

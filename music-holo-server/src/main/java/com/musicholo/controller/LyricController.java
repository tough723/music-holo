package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.musicholo.common.Result;
import com.musicholo.dto.LyricSaveDTO;
import com.musicholo.service.LyricService;
import com.musicholo.vo.LyricVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/**
 * 歌词处理相关接口：歌词解析、歌词导出、歌词保存 / 上传
 */
@Tag(name = "9-歌词处理相关接口")
@RestController
@RequestMapping("/lyric")
@RequiredArgsConstructor
public class LyricController {

    private final LyricService lyricService;

    @Operation(summary = "解析歌曲歌词（LRC -> 结构化歌词行）")
    @GetMapping("/parse")
    public Result<LyricVO> parse(@RequestParam Long songId) {
        return Result.success(lyricService.parse(songId));
    }

    @Operation(summary = "导出歌曲歌词（.lrc 文件下载）")
    @GetMapping("/export")
    public void export(@RequestParam Long songId,
                       @RequestParam(defaultValue = "original") String variant,
                       HttpServletResponse response) throws IOException {
        lyricService.export(songId, variant, response);
    }

    @Operation(summary = "保存歌曲歌词（覆盖）")
    @SaCheckLogin
    @PutMapping
    public Result<Void> save(@Validated @RequestBody LyricSaveDTO dto) {
        lyricService.save(dto.getSongId(), dto.getLyric(), dto.getLyricTranslation(), dto.getLyricRomaji());
        return Result.success();
    }

    @Operation(summary = "上传歌词文件（.lrc / .txt，覆盖歌曲歌词）")
    @SaCheckLogin
    @PostMapping("/upload")
    public Result<Void> upload(@RequestParam Long songId,
                               @RequestParam(defaultValue = "original") String variant,
                               MultipartFile file) throws IOException {
        lyricService.upload(songId, file, variant);
        return Result.success();
    }
}

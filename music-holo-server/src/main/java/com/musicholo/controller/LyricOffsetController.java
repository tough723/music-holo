package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.LyricOffsetSubmitDTO;
import com.musicholo.service.LyricOffsetService;
import com.musicholo.vo.LyricOffsetVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 歌词时间轴校正：查询对任何人开放，提交/撤回需要登录。
 */
@Tag(name = "19-歌词时间轴校正")
@RestController
@RequestMapping("/lyric/offset")
@RequiredArgsConstructor
public class LyricOffsetController {

    private final LyricOffsetService lyricOffsetService;

    @Operation(summary = "查询一首歌的歌词时间轴校正（未登录返回共识值）")
    @GetMapping
    public Result<LyricOffsetVO> get(@RequestParam Long songId) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(lyricOffsetService.get(songId, userId));
    }

    @Operation(summary = "提交自己的歌词时间轴校正（覆盖语义）")
    @SaCheckLogin
    @PostMapping
    public Result<LyricOffsetVO> submit(@Valid @RequestBody LyricOffsetSubmitDTO dto) {
        return Result.success(lyricOffsetService.submit(StpUtil.getLoginIdAsLong(), dto));
    }

    @Operation(summary = "撤回自己提交的歌词时间轴校正")
    @SaCheckLogin
    @DeleteMapping
    public Result<Void> withdraw(@RequestParam Long songId) {
        lyricOffsetService.withdraw(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }
}

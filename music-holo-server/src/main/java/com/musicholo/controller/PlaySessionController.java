package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.PlaySessionSaveDTO;
import com.musicholo.service.PlaySessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 播放会话快照：队列 + 当前曲目 + 进度 + 模式 + 倍速，保存在 Redis（7 天），用于跨设备续播。
 */
@Tag(name = "20-播放会话快照")
@SaCheckLogin
@RestController
@RequestMapping("/session")
@RequiredArgsConstructor
public class PlaySessionController {

    private final PlaySessionService playSessionService;

    @Operation(summary = "保存当前会话快照（整体覆盖），返回写入与到期时间")
    @PutMapping
    public Result<Map<String, Object>> save(@RequestBody PlaySessionSaveDTO dto) {
        return Result.success(playSessionService.save(StpUtil.getLoginIdAsLong(), dto));
    }

    @Operation(summary = "读取当前会话快照；没有快照时 data 为 null")
    @GetMapping
    public Result<Map<String, Object>> get() {
        return Result.success(playSessionService.get(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "清除当前会话快照")
    @DeleteMapping
    public Result<Void> clear() {
        playSessionService.clear(StpUtil.getLoginIdAsLong());
        return Result.success();
    }
}

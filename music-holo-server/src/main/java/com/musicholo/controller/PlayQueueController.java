package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.service.PlayQueueService;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 播放列表相关接口（登录用户的临时播放队列，基于 Redis）：
 * 新增、清空列表、添加一首歌曲、批量添加歌曲
 */
@Tag(name = "8-播放列表相关接口")
@SaCheckLogin
@RestController
@RequestMapping("/play/queue")
@RequiredArgsConstructor
public class PlayQueueController {

    private final PlayQueueService playQueueService;

    @Operation(summary = "获取当前用户的播放队列")
    @GetMapping
    public Result<List<SongVO>> queue() {
        return Result.success(playQueueService.getQueue(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "队列长度")
    @GetMapping("/size")
    public Result<Integer> size() {
        return Result.success(playQueueService.size(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "添加一首歌曲到播放队列")
    @PostMapping("/add")
    public Result<Integer> add(@RequestParam Long songId) {
        return Result.success(playQueueService.add(StpUtil.getLoginIdAsLong(), songId));
    }

    @Operation(summary = "批量添加歌曲到播放队列")
    @PostMapping("/addBatch")
    public Result<Integer> addBatch(@RequestBody List<Long> songIds) {
        return Result.success(playQueueService.addBatch(StpUtil.getLoginIdAsLong(), songIds));
    }

    @Operation(summary = "从播放队列移除一首歌曲")
    @DeleteMapping("/{songId}")
    public Result<Void> remove(@PathVariable Long songId) {
        playQueueService.remove(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "清空播放队列")
    @DeleteMapping("/clear")
    public Result<Void> clear() {
        playQueueService.clear(StpUtil.getLoginIdAsLong());
        return Result.success();
    }
}

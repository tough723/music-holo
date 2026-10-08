package com.musicholo.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.service.RecommendationService;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 基于收藏/播放行为的轻量个性化推荐 */
@Tag(name = "14-个性化推荐")
@RestController
@RequestMapping("/recommend")
@RequiredArgsConstructor
public class RecommendationController {

    private final RecommendationService recommendationService;

    @Operation(summary = "获取猜你喜欢歌曲；匿名用户返回热歌冷启动结果")
    @GetMapping("/songs")
    public Result<List<SongVO>> songs(@RequestParam(defaultValue = "8") Integer limit) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(recommendationService.songs(userId, limit));
    }

    @Operation(summary = "根据一首歌曲生成相似歌曲电台候选")
    @GetMapping("/similar")
    public Result<List<SongVO>> similar(
            @RequestParam Long sourceSongId,
            @RequestParam(defaultValue = "12") Integer limit) {
        return Result.success(recommendationService.similar(sourceSongId, limit));
    }
}

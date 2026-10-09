package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.service.DislikeService;
import com.musicholo.vo.DislikeSummaryVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 账号级不喜欢规则。只跳过自动切歌、每日推荐和相似电台，不隐藏搜索、排行榜或管理后台。
 */
@Tag(name = "18-不喜欢规则")
@SaCheckLogin
@RestController
@RequestMapping("/dislike")
@RequiredArgsConstructor
public class DislikeController {

    private final DislikeService dislikeService;

    @Operation(summary = "当前账号的不喜欢歌曲与歌手")
    @GetMapping
    public Result<DislikeSummaryVO> summary() {
        return Result.success(dislikeService.summary(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "屏蔽一首歌曲；重复添加视为成功，不删除曲库")
    @PostMapping("/song/{songId}")
    public Result<Void> addSong(@PathVariable Long songId) {
        dislikeService.addSong(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "撤销一首歌曲的不喜欢规则")
    @DeleteMapping("/song/{songId}")
    public Result<Void> removeSong(@PathVariable Long songId) {
        dislikeService.removeSong(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "屏蔽一位歌手的自动播放；重复添加视为成功")
    @PostMapping("/singer/{singerId}")
    public Result<Void> addSinger(@PathVariable Long singerId) {
        dislikeService.addSinger(StpUtil.getLoginIdAsLong(), singerId);
        return Result.success();
    }

    @Operation(summary = "撤销一位歌手的不喜欢规则")
    @DeleteMapping("/singer/{singerId}")
    public Result<Void> removeSinger(@PathVariable Long singerId) {
        dislikeService.removeSinger(StpUtil.getLoginIdAsLong(), singerId);
        return Result.success();
    }
}

package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.service.FavoriteService;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 歌曲收藏相关接口：添加收藏、取消收藏、收藏列表查询
 */
@Tag(name = "10-歌曲收藏相关接口")
@SaCheckLogin
@RestController
@RequestMapping("/favorite")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    @Operation(summary = "添加收藏")
    @PostMapping("/{songId}")
    public Result<Void> add(@PathVariable Long songId) {
        favoriteService.add(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "取消收藏")
    @DeleteMapping("/{songId}")
    public Result<Void> cancel(@PathVariable Long songId) {
        favoriteService.cancel(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "收藏列表分页查询")
    @GetMapping("/page")
    public Result<Page<SongVO>> page(@RequestParam(defaultValue = "1") long pageNum,
                                     @RequestParam(defaultValue = "10") long pageSize) {
        return Result.success(favoriteService.page(StpUtil.getLoginIdAsLong(), pageNum, pageSize));
    }

    @Operation(summary = "当前用户收藏的全部歌曲 id")
    @GetMapping("/ids")
    public Result<List<Long>> ids() {
        return Result.success(favoriteService.ids(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "判断歌曲是否已收藏")
    @GetMapping("/check")
    public Result<Boolean> check(@RequestParam Long songId) {
        return Result.success(favoriteService.isFavorite(StpUtil.getLoginIdAsLong(), songId));
    }
}

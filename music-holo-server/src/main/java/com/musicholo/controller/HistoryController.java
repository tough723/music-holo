package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.service.PlayHistoryService;
import com.musicholo.vo.PlayHistoryVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 用户最近播放记录 */
@Tag(name = "12-最近播放历史")
@RestController
@RequestMapping("/history")
@SaCheckLogin
@RequiredArgsConstructor
public class HistoryController {

    private final PlayHistoryService historyService;

    @Operation(summary = "分页查询当前用户的最近播放记录")
    @GetMapping("/page")
    public Result<Page<PlayHistoryVO>> page(
            @RequestParam(defaultValue = "1") long pageNum,
            @RequestParam(defaultValue = "20") long pageSize) {
        return Result.success(historyService.page(StpUtil.getLoginIdAsLong(), pageNum, pageSize));
    }

    @Operation(summary = "移除当前用户的一首歌曲收听记录")
    @DeleteMapping("/{songId}")
    public Result<Void> remove(@PathVariable Long songId) {
        historyService.remove(StpUtil.getLoginIdAsLong(), songId);
        return Result.success();
    }

    @Operation(summary = "清空当前用户的全部收听记录")
    @DeleteMapping
    public Result<Void> clear() {
        historyService.clear(StpUtil.getLoginIdAsLong());
        return Result.success();
    }
}

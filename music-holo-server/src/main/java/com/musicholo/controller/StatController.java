package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.StatEventDTO;
import com.musicholo.service.StatEventService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 收听统计：客户端批量上报播放/跳过/播完/错误事件（按 eventId 幂等），汇总供「最近听歌报告」使用。
 */
@Tag(name = "21-收听统计")
@SaCheckLogin
@RestController
@RequestMapping("/stat")
@RequiredArgsConstructor
public class StatController {

    private final StatEventService statEventService;

    @Operation(summary = "批量上报收听事件；重复 eventId 计入 duplicates，不重复入库")
    @PostMapping("/batch")
    public Result<Map<String, Object>> batch(@RequestBody List<StatEventDTO> events) {
        return Result.success(statEventService.batch(StpUtil.getLoginIdAsLong(), events));
    }

    @Operation(summary = "最近 N 天收听汇总（默认 7 天，最多 90 天）")
    @GetMapping("/summary")
    public Result<Map<String, Object>> summary(@RequestParam(defaultValue = "7") Integer days) {
        return Result.success(statEventService.summary(StpUtil.getLoginIdAsLong(), days));
    }
}

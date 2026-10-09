package com.musicholo.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.ThemeDTO;
import com.musicholo.service.SystemService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 系统设置相关接口：主题修改、系统参数查询
 */
@Tag(name = "3-系统设置相关接口")
@RestController
@RequestMapping("/system")
@RequiredArgsConstructor
public class SystemController {

    private final SystemService systemService;

    @Operation(summary = "获取主题设置（全局默认 + 当前生效主题）")
    @GetMapping("/theme")
    public Result<Map<String, Object>> theme() {
        return Result.success(systemService.getTheme());
    }

    @Operation(summary = "设置主题（scope=user 个人主题，scope=global 全局主题需管理员）")
    @PutMapping("/theme")
    public Result<Map<String, Object>> setTheme(@Validated @RequestBody ThemeDTO dto) {
        return Result.success(systemService.setTheme(StpUtil.getLoginIdAsLong(), dto));
    }

    @Operation(summary = "查询系统公开参数")
    @GetMapping("/config/{key}")
    public Result<Map<String, Object>> config(@PathVariable String key) {
        return Result.success(systemService.getPublicConfig(key));
    }
}

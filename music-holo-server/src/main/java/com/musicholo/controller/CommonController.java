package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckRole;
import com.musicholo.common.Result;
import com.musicholo.config.SaTokenConfig;
import com.musicholo.service.CommonService;
import com.musicholo.vo.DictVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 其他公共接口：代码表查询、文件上传下载、平台统计
 */
@Tag(name = "11-其他公共接口")
@RestController
@RequestMapping("/common")
@RequiredArgsConstructor
public class CommonController {

    private final CommonService commonService;

    @Operation(summary = "按类型查询代码表（字典数据）")
    @GetMapping("/dict/{dictType}")
    public Result<List<DictVO>> dict(@PathVariable String dictType) {
        return Result.success(commonService.dictByType(dictType));
    }

    @Operation(summary = "查询全部代码表（按类型分组）")
    @GetMapping("/dict/all")
    public Result<Map<String, List<DictVO>>> dictAll() {
        return Result.success(commonService.dictAll());
    }

    @Operation(summary = "文件上传（图片 / 音频 / 歌词等）")
    @SaCheckLogin
    @PostMapping("/upload")
    public Result<Map<String, Object>> upload(MultipartFile file) {
        return Result.success(commonService.upload(file));
    }

    @Operation(summary = "文件下载")
    @GetMapping("/download")
    public void download(@RequestParam String fileName, HttpServletResponse response) throws IOException {
        commonService.download(fileName, response);
    }

    @Operation(summary = "平台统计数据（仪表盘）")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        return Result.success(commonService.stats());
    }
}

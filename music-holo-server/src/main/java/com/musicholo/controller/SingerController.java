package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.config.SaTokenConfig;
import com.musicholo.dto.SingerQuery;
import com.musicholo.dto.SingerSaveDTO;
import com.musicholo.service.SingerService;
import com.musicholo.vo.SingerVO;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * 歌手相关接口：增删改查、歌手歌曲查询、导入导出
 */
@Tag(name = "4-歌手相关接口")
@RestController
@RequestMapping("/singer")
@RequiredArgsConstructor
public class SingerController {

    private final SingerService singerService;

    @Operation(summary = "歌手分页查询")
    @GetMapping("/page")
    public Result<Page<SingerVO>> page(SingerQuery query) {
        return Result.success(singerService.page(query));
    }

    @Operation(summary = "歌手详情")
    @GetMapping("/{id}")
    public Result<SingerVO> detail(@PathVariable Long id) {
        return Result.success(singerService.detail(id));
    }

    @Operation(summary = "查询歌手的歌曲列表")
    @GetMapping("/{id}/songs")
    public Result<List<SongVO>> songs(@PathVariable Long id) {
        return Result.success(singerService.songsOfSinger(id));
    }

    @Operation(summary = "新增歌手")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PostMapping
    public Result<SingerVO> add(@Validated @RequestBody SingerSaveDTO dto) {
        return Result.success(singerService.save(dto));
    }

    @Operation(summary = "修改歌手信息")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PutMapping
    public Result<SingerVO> update(@Validated @RequestBody SingerSaveDTO dto) {
        return Result.success(singerService.save(dto));
    }

    @Operation(summary = "删除歌手")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        singerService.delete(id);
        return Result.success();
    }

    @Operation(summary = "导出歌手 CSV")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @GetMapping("/export")
    public void export(HttpServletResponse response) throws IOException {
        singerService.export(response);
    }

    @Operation(summary = "下载歌手导入模板")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @GetMapping("/template")
    public void template(HttpServletResponse response) throws IOException {
        singerService.exportTemplate(response);
    }

    @Operation(summary = "导入歌手 CSV")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PostMapping("/import")
    public Result<Integer> importCsv(MultipartFile file) throws IOException {
        return Result.success(singerService.importCsv(file));
    }
}

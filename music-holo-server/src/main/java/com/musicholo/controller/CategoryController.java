package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.musicholo.common.Result;
import com.musicholo.config.SaTokenConfig;
import com.musicholo.dto.CategorySaveDTO;
import com.musicholo.entity.SongCategory;
import com.musicholo.service.CategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 歌曲分类相关接口：分类列表、添加、修改、删除
 */
@Tag(name = "7-歌曲分类相关接口")
@RestController
@RequestMapping("/category")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @Operation(summary = "歌曲分类列表")
    @GetMapping("/list")
    public Result<List<SongCategory>> list() {
        return Result.success(categoryService.list());
    }

    @Operation(summary = "新增分类")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PostMapping
    public Result<SongCategory> add(@Validated @RequestBody CategorySaveDTO dto) {
        return Result.success(categoryService.save(dto));
    }

    @Operation(summary = "修改分类")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PutMapping
    public Result<SongCategory> update(@Validated @RequestBody CategorySaveDTO dto) {
        return Result.success(categoryService.save(dto));
    }

    @Operation(summary = "删除分类")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        categoryService.delete(id);
        return Result.success();
    }
}

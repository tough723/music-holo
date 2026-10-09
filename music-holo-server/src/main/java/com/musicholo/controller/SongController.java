package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.config.SaTokenConfig;
import com.musicholo.dto.SongQuery;
import com.musicholo.dto.SongSaveDTO;
import com.musicholo.service.SongService;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

/**
 * 歌曲相关接口：增删改查、歌曲播放（播放量统计）
 */
@Tag(name = "6-歌曲相关接口")
@RestController
@RequestMapping("/song")
@RequiredArgsConstructor
public class SongController {

    private final SongService songService;

    @Operation(summary = "歌曲分页查询（支持关键字 / 分类 / 歌手过滤）")
    @GetMapping("/page")
    public Result<Page<SongVO>> page(SongQuery query) {
        return Result.success(songService.page(query));
    }

    @Operation(summary = "歌曲详情（含歌词与收藏状态）")
    @GetMapping("/{id}")
    public Result<SongVO> detail(@PathVariable Long id) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(songService.detail(id, userId));
    }

    @Operation(summary = "新增歌曲")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PostMapping
    public Result<SongVO> add(@Validated @RequestBody SongSaveDTO dto) {
        return Result.success(songService.save(dto));
    }

    @Operation(summary = "修改歌曲信息")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @PutMapping
    public Result<SongVO> update(@Validated @RequestBody SongSaveDTO dto) {
        return Result.success(songService.save(dto));
    }

    @Operation(summary = "删除歌曲")
    @SaCheckRole(SaTokenConfig.ROLE_ADMIN)
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        songService.delete(id);
        return Result.success();
    }

    @Operation(summary = "歌曲播放（播放量 +1，返回最新播放量）")
    @PutMapping("/{id}/play")
    public Result<Long> play(@PathVariable Long id) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(songService.play(id, userId));
    }
}

package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.dto.PlaylistQuery;
import com.musicholo.dto.PlaylistSaveDTO;
import com.musicholo.service.PlaylistService;
import com.musicholo.vo.PlaylistVO;
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

import java.util.List;

/**
 * 歌单相关接口：增删改查、歌单歌曲查询、歌单歌曲维护
 */
@Tag(name = "5-歌单相关接口")
@RestController
@RequestMapping("/playlist")
@RequiredArgsConstructor
public class PlaylistController {

    private final PlaylistService playlistService;

    @Operation(summary = "歌单分页查询")
    @GetMapping("/page")
    public Result<Page<PlaylistVO>> page(PlaylistQuery query) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(playlistService.page(query, userId));
    }

    @Operation(summary = "歌单详情")
    @GetMapping("/{id}")
    public Result<PlaylistVO> detail(@PathVariable Long id) {
        return Result.success(playlistService.detail(id));
    }

    @Operation(summary = "查询歌单内的歌曲列表")
    @GetMapping("/{id}/songs")
    public Result<List<SongVO>> songs(@PathVariable Long id) {
        return Result.success(playlistService.songsOfPlaylist(id));
    }

    @Operation(summary = "新增歌单")
    @SaCheckLogin
    @PostMapping
    public Result<PlaylistVO> add(@Validated @RequestBody PlaylistSaveDTO dto) {
        return Result.success(playlistService.save(dto, StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "修改歌单信息")
    @SaCheckLogin
    @PutMapping
    public Result<PlaylistVO> update(@Validated @RequestBody PlaylistSaveDTO dto) {
        return Result.success(playlistService.save(dto, StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "删除歌单")
    @SaCheckLogin
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        playlistService.delete(id, StpUtil.getLoginIdAsLong());
        return Result.success();
    }

    @Operation(summary = "批量添加歌曲到歌单")
    @SaCheckLogin
    @PostMapping("/{id}/songs")
    public Result<Integer> addSongs(@PathVariable Long id, @RequestBody List<Long> songIds) {
        return Result.success(playlistService.addSongs(id, songIds, StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "从歌单移除一首歌曲")
    @SaCheckLogin
    @DeleteMapping("/{id}/songs/{songId}")
    public Result<Void> removeSong(@PathVariable Long id, @PathVariable Long songId) {
        playlistService.removeSong(id, songId, StpUtil.getLoginIdAsLong());
        return Result.success();
    }
}

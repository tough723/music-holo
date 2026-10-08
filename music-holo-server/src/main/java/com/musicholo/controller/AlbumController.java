package com.musicholo.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.musicholo.common.Result;
import com.musicholo.service.AlbumService;
import com.musicholo.vo.AlbumVO;
import com.musicholo.vo.SongVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 专辑浏览接口：从已上架曲目聚合，不依赖单独的专辑表或外部数据源。 */
@Tag(name = "17-专辑浏览接口")
@RestController
@RequestMapping("/album")
@RequiredArgsConstructor
public class AlbumController {

    private final AlbumService albumService;

    @Operation(summary = "专辑分页查询，可按专辑名或歌手名过滤")
    @GetMapping("/page")
    public Result<IPage<AlbumVO>> page(
            @RequestParam(defaultValue = "1") long pageNum,
            @RequestParam(defaultValue = "12") long pageSize,
            @RequestParam(required = false) String keyword) {
        return Result.success(albumService.page(pageNum, pageSize, keyword));
    }

    @Operation(summary = "专辑详情（专辑名与歌手共同定位）")
    @GetMapping("/detail")
    public Result<AlbumVO> detail(
            @RequestParam String album,
            @RequestParam(required = false) Long singerId) {
        return Result.success(albumService.detail(album, singerId));
    }

    @Operation(summary = "查询专辑曲目")
    @GetMapping("/songs")
    public Result<List<SongVO>> songs(
            @RequestParam String album,
            @RequestParam(required = false) Long singerId) {
        return Result.success(albumService.songs(album, singerId));
    }
}

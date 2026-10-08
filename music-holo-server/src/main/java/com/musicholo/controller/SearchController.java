package com.musicholo.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.service.SearchService;
import com.musicholo.vo.SearchResultVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 跨歌曲、歌词、歌手、歌单的统一搜索 */
@Tag(name = "13-全局搜索")
@RestController
@RequestMapping("/search")
@RequiredArgsConstructor
public class SearchController {

    private final SearchService searchService;

    @Operation(summary = "搜索歌曲（含歌词）、歌手与可见歌单")
    @GetMapping
    public Result<SearchResultVO> search(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "8") Integer limit) {
        Long userId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(searchService.search(keyword, limit, userId));
    }
}

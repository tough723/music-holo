package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.dto.MusicReviewCreateDTO;
import com.musicholo.dto.MusicReviewLikeDTO;
import com.musicholo.dto.MusicReviewPageQuery;
import com.musicholo.dto.MusicReviewReportDTO;
import com.musicholo.service.MusicReviewService;
import com.musicholo.vo.MusicReviewLikeVO;
import com.musicholo.vo.MusicReviewVO;
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

/** 面向歌曲与公开歌单的短评、点赞和举报接口。 */
@Tag(name = "15-歌曲与歌单短评")
@RestController
@RequestMapping("/review")
@RequiredArgsConstructor
public class MusicReviewController {

    private final MusicReviewService reviewService;

    @Operation(summary = "公开短评分页；作者可额外查看自己的隐藏短评")
    @GetMapping("/page")
    public Result<Page<MusicReviewVO>> page(@Validated MusicReviewPageQuery query) {
        Long viewerId = StpUtil.isLogin() ? StpUtil.getLoginIdAsLong() : null;
        return Result.success(reviewService.page(query, viewerId));
    }

    @Operation(summary = "登录用户发布短评")
    @SaCheckLogin
    @PostMapping
    public Result<MusicReviewVO> create(@Validated @RequestBody MusicReviewCreateDTO dto) {
        return Result.success(reviewService.create(dto, StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "作者删除自己的短评")
    @SaCheckLogin
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        reviewService.delete(id, StpUtil.getLoginIdAsLong());
        return Result.success();
    }

    @Operation(summary = "设置当前用户对短评的点赞状态")
    @SaCheckLogin
    @PutMapping("/{id}/like")
    public Result<MusicReviewLikeVO> setLiked(@PathVariable Long id,
                                               @Validated @RequestBody MusicReviewLikeDTO dto) {
        return Result.success(reviewService.setLiked(id, StpUtil.getLoginIdAsLong(), dto.getLiked()));
    }

    @Operation(summary = "举报一条短评；同一用户对同一条短评只能举报一次")
    @SaCheckLogin
    @PostMapping("/{id}/report")
    public Result<Void> report(@PathVariable Long id, @Validated @RequestBody MusicReviewReportDTO dto) {
        reviewService.report(id, StpUtil.getLoginIdAsLong(), dto);
        return Result.success();
    }
}

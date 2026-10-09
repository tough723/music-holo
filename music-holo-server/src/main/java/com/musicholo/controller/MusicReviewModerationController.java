package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.Result;
import com.musicholo.config.SaTokenConfig;
import com.musicholo.dto.MusicReviewPageQuery;
import com.musicholo.dto.MusicReviewReportActionDTO;
import com.musicholo.dto.MusicReviewVisibilityDTO;
import com.musicholo.service.MusicReviewService;
import com.musicholo.vo.MusicReviewReportVO;
import com.musicholo.vo.MusicReviewVO;
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

/** 管理员处理短评举报、隐藏与恢复。 */
@Tag(name = "16-短评审核")
@RestController
@RequestMapping("/review/admin")
@SaCheckRole(SaTokenConfig.ROLE_ADMIN)
@RequiredArgsConstructor
public class MusicReviewModerationController {

    private final MusicReviewService reviewService;

    @Operation(summary = "短评分页，可按状态与对象筛选")
    @GetMapping("/page")
    public Result<Page<MusicReviewVO>> page(@Validated MusicReviewPageQuery query) {
        return Result.success(reviewService.adminPage(query, StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "举报队列分页，默认列出待处理举报")
    @GetMapping("/reports/page")
    public Result<Page<MusicReviewReportVO>> reports(@Validated MusicReviewPageQuery query) {
        return Result.success(reviewService.reportPage(query));
    }

    @Operation(summary = "管理员隐藏或恢复短评")
    @PutMapping("/{id}/visibility")
    public Result<Void> setVisibility(@PathVariable Long id,
                                      @Validated @RequestBody MusicReviewVisibilityDTO dto) {
        reviewService.setVisibility(id, dto, StpUtil.getLoginIdAsLong());
        return Result.success();
    }

    @Operation(summary = "处理举报：隐藏短评并解决举报，或驳回举报")
    @PutMapping("/reports/{id}")
    public Result<Void> handleReport(@PathVariable Long id,
                                     @Validated @RequestBody MusicReviewReportActionDTO dto) {
        reviewService.handleReport(id, StpUtil.getLoginIdAsLong(), dto);
        return Result.success();
    }
}

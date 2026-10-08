package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.ChangePasswordDTO;
import com.musicholo.dto.UserUpdateDTO;
import com.musicholo.service.UserService;
import com.musicholo.vo.UserVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用户相关接口：资料查询 / 信息完善修改 / 密码修改
 */
@Tag(name = "2-用户相关接口")
@SaCheckLogin
@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @Operation(summary = "获取当前用户资料")
    @GetMapping("/profile")
    public Result<UserVO> profile() {
        return Result.success(userService.profile(StpUtil.getLoginIdAsLong()));
    }

    @Operation(summary = "修改当前用户资料")
    @PutMapping("/profile")
    public Result<UserVO> updateProfile(@Validated @RequestBody UserUpdateDTO dto) {
        return Result.success(userService.updateProfile(StpUtil.getLoginIdAsLong(), dto));
    }

    @Operation(summary = "修改密码")
    @PutMapping("/password")
    public Result<Void> changePassword(@Validated @RequestBody ChangePasswordDTO dto) {
        userService.changePassword(StpUtil.getLoginIdAsLong(), dto);
        return Result.success();
    }
}

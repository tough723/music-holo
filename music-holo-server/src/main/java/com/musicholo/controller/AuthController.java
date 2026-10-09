package com.musicholo.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.common.Result;
import com.musicholo.dto.LoginDTO;
import com.musicholo.dto.RegisterDTO;
import com.musicholo.service.UserService;
import com.musicholo.vo.LoginVO;
import com.musicholo.vo.UserVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证相关接口：注册 / 登录 / 退出 / 当前用户信息
 */
@Tag(name = "1-认证相关接口")
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    @Operation(summary = "用户登录")
    @PostMapping("/login")
    public Result<LoginVO> login(@Validated @RequestBody LoginDTO dto) {
        return Result.success(userService.login(dto));
    }

    @Operation(summary = "用户注册")
    @PostMapping("/register")
    public Result<UserVO> register(@Validated @RequestBody RegisterDTO dto) {
        return Result.success(userService.register(dto));
    }

    @Operation(summary = "退出登录")
    @SaCheckLogin
    @PostMapping("/logout")
    public Result<Void> logout() {
        userService.logout();
        return Result.success();
    }

    @Operation(summary = "获取当前登录用户信息")
    @SaCheckLogin
    @GetMapping("/info")
    public Result<UserVO> info() {
        return Result.success(userService.profile(StpUtil.getLoginIdAsLong()));
    }
}

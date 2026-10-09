package com.musicholo.common;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.exception.NotRoleException;
import com.musicholo.common.exception.BusinessException;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public Result<?> business(BusinessException e) {
        return Result.error(e.getCode(), e.getMsg());
    }

    @ExceptionHandler(NotLoginException.class)
    public Result<?> notLogin(NotLoginException e) {
        return Result.error(Result.CODE_UNAUTHORIZED, "未登录或登录已过期，请重新登录");
    }

    @ExceptionHandler({NotRoleException.class, NotPermissionException.class})
    public Result<?> noAuth() {
        return Result.error(Result.CODE_FORBIDDEN, "没有访问权限");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<?> methodArgumentNotValid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getDefaultMessage())
                .orElse("参数校验失败");
        return Result.error(Result.CODE_BAD_REQUEST, msg);
    }

    @ExceptionHandler(BindException.class)
    public Result<?> bind(BindException e) {
        String msg = e.getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getDefaultMessage())
                .orElse("参数绑定失败");
        return Result.error(Result.CODE_BAD_REQUEST, msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public Result<?> constraintViolation(ConstraintViolationException e) {
        return Result.error(Result.CODE_BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public Result<?> all(Exception e) {
        log.error("系统异常", e);
        return Result.error("系统繁忙，请稍后再试");
    }
}

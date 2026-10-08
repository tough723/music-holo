package com.musicholo.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Objects;

/**
 * 统一响应结果
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Result<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final int CODE_SUCCESS = 200;
    public static final int CODE_ERROR = 500;
    public static final int CODE_UNAUTHORIZED = 401;
    public static final int CODE_FORBIDDEN = 403;
    public static final int CODE_BAD_REQUEST = 400;

    /** 状态码：200成功，其他为失败 */
    private Integer code;

    /** 提示信息 */
    private String msg;

    /** 响应数据 */
    private T data;

    public static <T> Result<T> success() {
        return new Result<>(CODE_SUCCESS, "success", null);
    }

    public static <T> Result<T> success(T data) {
        return new Result<>(CODE_SUCCESS, "success", data);
    }

    public static <T> Result<T> error(String msg) {
        return new Result<>(CODE_ERROR, msg, null);
    }

    public static <T> Result<T> error(Integer code, String msg) {
        return new Result<>(code, msg, null);
    }

    public boolean isSuccess() {
        return Objects.equals(code, CODE_SUCCESS);
    }
}

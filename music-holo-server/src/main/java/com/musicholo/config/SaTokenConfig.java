package com.musicholo.config;

import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.musicholo.entity.SysUser;
import com.musicholo.mapper.SysUserMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Sa-Token 权限认证配置
 * <p>
 * 分两层：
 * 1. {@link LoginInterceptor}：自定义登录拦截器，按「路径前缀 + HTTP方法」放行公开接口，其余统一校验登录；
 * 2. {@link SaInterceptor}：Sa-Token 注解式鉴权拦截器（免登录 auth 函数），负责 @SaCheckLogin / @SaCheckRole 等注解校验。
 */
@Configuration
public class SaTokenConfig implements WebMvcConfigurer {

    /** 角色标识 */
    public static final String ROLE_ADMIN = "admin";
    public static final String ROLE_USER = "user";

    /** 全部放行的 GET 接口前缀（资源浏览类，无需登录即可访问） */
    private static final List<String> PUBLIC_GET_PREFIX = List.of(
            "/search", "/recommend", "/singer", "/song", "/category", "/playlist",
            "/common/dict", "/common/download",
            "/lyric/parse", "/lyric/export",
            "/system/theme", "/system/config",
            "/profile"
    );

    /** 全部放行的路径前缀（文档 / 静态资源等，不限方法） */
    private static final List<String> PUBLIC_PREFIX = List.of(
            "/doc.html", "/v3/api-docs", "/webjars", "/favicon.ico",
            "/swagger-resources", "/service-worker.js", "/error"
    );

    /** 完全公开的接口（不限方法场景下的补充，均为 POST） */
    private static final List<String> PUBLIC_EXACT = List.of(
            "/auth/login", "/auth/register"
    );

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 1. 登录校验拦截器（方法级放行策略）
        registry.addInterceptor(new LoginInterceptor())
                .addPathPatterns("/**")
                .excludePathPatterns("/error");

        // 2. Sa-Token 注解式鉴权拦截器（auth 函数为空，仅执行注解校验，如 @SaCheckRole("admin")）
        registry.addInterceptor(new SaInterceptor())
                .addPathPatterns("/**")
                .excludePathPatterns("/error");
    }

    /**
     * 判断请求是否属于公开接口
     */
    public static boolean isPublic(String path, String method) {
        // 跨域预检请求直接放行
        if ("OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }
        // 播放上报允许游客调用；已登录用户额外写入个人收听历史
        if ("PUT".equalsIgnoreCase(method) && path.matches("/song/[0-9]+/play")) {
            return true;
        }
        for (String prefix : PUBLIC_PREFIX) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        if (PUBLIC_EXACT.contains(path)) {
            return true;
        }
        if ("GET".equalsIgnoreCase(method)) {
            for (String prefix : PUBLIC_GET_PREFIX) {
                if (path.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 自定义登录拦截器
     */
    static class LoginInterceptor implements HandlerInterceptor {
        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            String path = request.getRequestURI();
            String method = request.getMethod();
            if (isPublic(path, method)) {
                return true;
            }
            // 未放行的接口统一校验登录，未登录时抛出 NotLoginException（由全局异常处理返回 401）
            StpUtil.checkLogin();
            return true;
        }
    }

    /**
     * Sa-Token 角色 / 权限数据提供者
     */
    @Bean
    public StpInterface stpInterface(SysUserMapper sysUserMapper) {
        return new StpInterface() {
            @Override
            public List<String> getPermissionList(Object loginId, String loginType) {
                // 平台接口按角色控制即可，权限点统一放行
                return List.of("*:*:*");
            }

            @Override
            public List<String> getRoleList(Object loginId, String loginType) {
                SysUser user = sysUserMapper.selectById(Long.valueOf(String.valueOf(loginId)));
                if (user != null && Integer.valueOf(0).equals(user.getRole())) {
                    return List.of(ROLE_ADMIN);
                }
                return List.of(ROLE_USER);
            }
        };
    }
}

package com.musicholo.service;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.ThemeDTO;
import com.musicholo.entity.SysConfig;
import com.musicholo.entity.SysUser;
import com.musicholo.mapper.SysConfigMapper;
import com.musicholo.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统设置服务：主题修改、系统参数查询
 */
@Service
@RequiredArgsConstructor
public class SystemService {

    /** 平台支持的全部主题 */
    public static final List<String> THEMES = List.of("cyan", "magenta", "amber", "lime");

    public static final String CONFIG_KEY_THEME = "theme";
    public static final String CONFIG_KEY_SITE_NAME = "site_name";

    private final SysConfigMapper sysConfigMapper;
    private final SysUserMapper sysUserMapper;
    private final UserService userService;

    /**
     * 获取主题信息：全局默认主题 + 当前生效主题
     */
    public Map<String, Object> getTheme() {
        String global = getConfigValue(CONFIG_KEY_THEME, "cyan");
        String current = global;
        Object loginId = StpUtil.getLoginIdDefaultNull();
        if (loginId != null) {
            SysUser user = sysUserMapper.selectById(Long.valueOf(String.valueOf(loginId)));
            if (user != null && StrUtil.isNotBlank(user.getTheme())) {
                current = user.getTheme();
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("theme", current);
        result.put("global", global);
        result.put("themes", THEMES);
        return result;
    }

    /**
     * 设置主题
     *
     * @param scope user-个人主题（登录用户），global-全局默认主题（仅管理员）
     */
    public Map<String, Object> setTheme(Long userId, ThemeDTO dto) {
        String theme = dto.getTheme();
        if (!THEMES.contains(theme)) {
            throw new BusinessException("不支持的主题：" + theme);
        }
        String scope = StrUtil.isBlank(dto.getScope()) ? "user" : dto.getScope();
        if ("global".equals(scope)) {
            if (!userService.isAdmin(userId)) {
                throw new BusinessException(403, "仅管理员可设置全局主题");
            }
            setConfigValue(CONFIG_KEY_THEME, theme, "全局默认主题");
        } else {
            sysUserMapper.update(null, new LambdaUpdateWrapper<SysUser>()
                    .eq(SysUser::getId, userId)
                    .set(SysUser::getTheme, theme));
        }
        return getTheme();
    }

    /**
     * 查询单个系统参数（公开的配置项）
     */
    public Map<String, Object> getPublicConfig(String key) {
        Map<String, Object> result = new HashMap<>();
        result.put("key", key);
        result.put("value", getConfigValue(key, ""));
        return result;
    }

    public String getConfigValue(String key, String defaultValue) {
        SysConfig config = sysConfigMapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getConfigKey, key));
        return config == null ? defaultValue : config.getConfigValue();
    }

    public void setConfigValue(String key, String value, String name) {
        SysConfig config = sysConfigMapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                .eq(SysConfig::getConfigKey, key));
        if (config == null) {
            config = new SysConfig();
            config.setConfigKey(key);
            config.setConfigName(name);
            config.setConfigValue(value);
            sysConfigMapper.insert(config);
        } else {
            sysConfigMapper.update(null, new LambdaUpdateWrapper<SysConfig>()
                    .eq(SysConfig::getId, config.getId())
                    .set(SysConfig::getConfigValue, value));
        }
    }
}

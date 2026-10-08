package com.musicholo.service;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.ChangePasswordDTO;
import com.musicholo.dto.LoginDTO;
import com.musicholo.dto.RegisterDTO;
import com.musicholo.dto.UserUpdateDTO;
import com.musicholo.entity.SysUser;
import com.musicholo.mapper.SysUserMapper;
import com.musicholo.vo.LoginVO;
import com.musicholo.vo.UserVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 用户服务：注册 / 登录 / 资料完善修改 / 密码修改
 */
@Service
@RequiredArgsConstructor
public class UserService {

    private final SysUserMapper sysUserMapper;

    /**
     * 用户注册
     */
    public UserVO register(RegisterDTO dto) {
        Long count = sysUserMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, dto.getUsername()));
        if (count != null && count > 0) {
            throw new BusinessException("用户名已存在");
        }
        SysUser user = new SysUser();
        user.setUsername(dto.getUsername());
        user.setPassword(BCrypt.hashpw(dto.getPassword(), BCrypt.gensalt()));
        user.setNickname(StrUtil.isBlank(dto.getNickname()) ? dto.getUsername() : dto.getNickname());
        user.setGender(0);
        user.setRole(1);
        user.setTheme("cyan");
        user.setStatus(1);
        sysUserMapper.insert(user);
        return toVO(user);
    }

    /**
     * 用户登录，返回 token 与用户信息
     */
    public LoginVO login(LoginDTO dto) {
        SysUser user = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, dto.getUsername()));
        if (user == null || !BCrypt.checkpw(dto.getPassword(), user.getPassword())) {
            throw new BusinessException("用户名或密码错误");
        }
        if (Integer.valueOf(0).equals(user.getStatus())) {
            throw new BusinessException("账号已被禁用，请联系管理员");
        }
        StpUtil.login(user.getId());
        return new LoginVO(StpUtil.getTokenValue(), toVO(user));
    }

    /**
     * 退出登录
     */
    public void logout() {
        StpUtil.logout();
    }

    /**
     * 获取用户资料
     */
    public UserVO profile(Long userId) {
        SysUser user = getById(userId);
        return toVO(user);
    }

    /**
     * 修改用户资料（仅更新非空字段）
     */
    public UserVO updateProfile(Long userId, UserUpdateDTO dto) {
        SysUser user = getById(userId);
        LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<SysUser>()
                .eq(SysUser::getId, userId);
        if (StrUtil.isNotBlank(dto.getNickname())) {
            uw.set(SysUser::getNickname, dto.getNickname());
        }
        if (dto.getAvatar() != null) {
            uw.set(SysUser::getAvatar, dto.getAvatar());
        }
        if (dto.getEmail() != null) {
            uw.set(SysUser::getEmail, dto.getEmail());
        }
        if (dto.getPhone() != null) {
            uw.set(SysUser::getPhone, dto.getPhone());
        }
        if (dto.getGender() != null) {
            uw.set(SysUser::getGender, dto.getGender());
        }
        if (StrUtil.isNotBlank(dto.getTheme())) {
            uw.set(SysUser::getTheme, dto.getTheme());
        }
        sysUserMapper.update(null, uw);
        return toVO(getById(userId));
    }

    /**
     * 修改密码
     */
    public void changePassword(Long userId, ChangePasswordDTO dto) {
        SysUser user = getById(userId);
        if (!BCrypt.checkpw(dto.getOldPassword(), user.getPassword())) {
            throw new BusinessException("原密码不正确");
        }
        sysUserMapper.update(null, new LambdaUpdateWrapper<SysUser>()
                .eq(SysUser::getId, userId)
                .set(SysUser::getPassword, BCrypt.hashpw(dto.getNewPassword(), BCrypt.gensalt())));
        // 修改密码后踢出其他会话，强制重新登录
        StpUtil.logoutDevice(userId, "password-change");
    }

    public SysUser getById(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        return user;
    }

    public boolean isAdmin(Long userId) {
        SysUser user = sysUserMapper.selectById(userId);
        return user != null && Integer.valueOf(0).equals(user.getRole());
    }

    public static UserVO toVO(SysUser user) {
        UserVO vo = BeanUtil.copyProperties(user, UserVO.class);
        if (StrUtil.isBlank(vo.getTheme())) {
            vo.setTheme("cyan");
        }
        return vo;
    }
}

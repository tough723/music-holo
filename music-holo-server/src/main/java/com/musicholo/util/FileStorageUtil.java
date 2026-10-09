package com.musicholo.util;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import com.musicholo.common.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.Date;
import java.util.Set;

/**
 * 本地文件存储工具（上传 / 下载）
 */
@Component
public class FileStorageUtil {

    /** 允许上传的文件扩展名 */
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            // 图片
            "jpg", "jpeg", "png", "gif", "webp", "svg",
            // 音频
            "mp3", "wav", "ogg", "flac", "m4a",
            // 歌词 / 数据
            "lrc", "txt", "csv"
    );

    @Value("${music-holo.upload-path:./upload/}")
    private String uploadPath;

    /**
     * 保存上传文件，返回可访问的相对地址（/profile/xxx）
     */
    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("上传文件不能为空");
        }
        String original = file.getOriginalFilename();
        String ext = StrUtil.isBlank(original) ? "" : FileUtil.extName(original).toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new BusinessException("不支持的文件类型：." + ext);
        }
        // 扁平化存储：yyyyMMdd_uuid.ext，便于按文件名下载
        String fileName = cn.hutool.core.date.DateUtil.format(new Date(), "yyyyMMdd")
                + "_" + IdUtil.fastSimpleUUID() + "." + ext;
        File dest = FileUtil.file(uploadPath, fileName);
        FileUtil.mkParentDirs(dest);
        try {
            file.transferTo(dest.getAbsoluteFile());
        } catch (IOException e) {
            throw new BusinessException("文件保存失败：" + e.getMessage());
        }
        return "/profile/" + fileName;
    }

    /**
     * 按文件名获取上传目录中的文件（防止路径穿越）
     */
    public File getFile(String fileName) {
        if (StrUtil.isBlank(fileName)
                || fileName.contains("..")
                || fileName.contains("/")
                || fileName.contains("\\")) {
            return null;
        }
        File file = FileUtil.file(uploadPath, fileName);
        return file.exists() ? file : null;
    }

    public String getUploadPath() {
        return uploadPath;
    }
}

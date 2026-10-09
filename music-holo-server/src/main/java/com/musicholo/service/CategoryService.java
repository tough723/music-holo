package com.musicholo.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.CategorySaveDTO;
import com.musicholo.entity.Song;
import com.musicholo.entity.SongCategory;
import com.musicholo.mapper.SongCategoryMapper;
import com.musicholo.mapper.SongMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 歌曲分类服务：分类列表、添加、修改、删除
 */
@Service
@RequiredArgsConstructor
public class CategoryService {

    private final SongCategoryMapper categoryMapper;
    private final SongMapper songMapper;

    /**
     * 分类列表（按排序号升序）
     */
    public List<SongCategory> list() {
        return categoryMapper.selectList(new LambdaQueryWrapper<SongCategory>()
                .eq(SongCategory::getStatus, 1)
                .orderByAsc(SongCategory::getSort)
                .orderByAsc(SongCategory::getId));
    }

    /**
     * 新增 / 修改分类
     */
    public SongCategory save(CategorySaveDTO dto) {
        SongCategory category;
        if (dto.getId() == null) {
            category = new SongCategory();
            category.setStatus(1);
            category.setParentId(dto.getParentId() == null ? 0L : dto.getParentId());
        } else {
            category = getById(dto.getId());
            if (dto.getParentId() != null) {
                category.setParentId(dto.getParentId());
            }
        }
        category.setName(dto.getName());
        category.setSort(dto.getSort() == null ? 0 : dto.getSort());
        if (dto.getId() == null) {
            categoryMapper.insert(category);
        } else {
            categoryMapper.updateById(category);
        }
        return category;
    }

    /**
     * 删除分类（分类下存在歌曲时不允许删除）
     */
    public void delete(Long id) {
        getById(id);
        Long count = songMapper.selectCount(new LambdaQueryWrapper<Song>().eq(Song::getCategoryId, id));
        if (count != null && count > 0) {
            throw new BusinessException("该分类下存在歌曲，无法删除");
        }
        categoryMapper.deleteById(id);
    }

    public SongCategory getById(Long id) {
        SongCategory category = categoryMapper.selectById(id);
        if (category == null) {
            throw new BusinessException("歌曲分类不存在");
        }
        return category;
    }
}

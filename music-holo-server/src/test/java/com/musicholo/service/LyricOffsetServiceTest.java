package com.musicholo.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.LyricOffsetSubmitDTO;
import com.musicholo.entity.LyricOffsetCorrection;
import com.musicholo.entity.Song;
import com.musicholo.mapper.LyricOffsetCorrectionMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.LyricOffsetVO;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 歌词时间轴校正：共识取中位数（不足 3 份不下发）、提交覆盖、撤回、偏移限幅。
 */
@ExtendWith(MockitoExtension.class)
class LyricOffsetServiceTest {

    @Mock private LyricOffsetCorrectionMapper correctionMapper;
    @Mock private SongMapper songMapper;

    private LyricOffsetService service;

    @BeforeAll
    static void registerMybatisLambdaMetadata() {
        register(LyricOffsetCorrection.class);
        register(Song.class);
    }

    private static void register(Class<?> entityType) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityType.getName());
        assistant.setCurrentNamespace(entityType.getName() + "Mapper");
        TableInfoHelper.initTableInfo(assistant, entityType);
    }

    @BeforeEach
    void setUp() {
        service = new LyricOffsetService(correctionMapper, songMapper);
    }

    @Test
    void consensusIsNotPublishedBelowThreeReports() {
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(100), row(800)));

        LyricOffsetVO vo = service.get(1L, null);

        assertNull(vo.getOffsetMs());
        assertEquals(2, vo.getCount());
        assertEquals(LyricOffsetService.MIN_REPORTS, vo.getMinReports());
        assertNull(vo.getMine());
        assertEquals(1L, vo.getSongId());
    }

    @Test
    void oddReportCountTakesTheMiddleOffset() {
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(2000), row(100), row(800)));

        assertEquals(800, service.get(1L, null).getOffsetMs());
    }

    @Test
    void evenReportCountAveragesTheTwoMiddleOffsets() {
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(900), row(-500), row(300), row(100)));

        // 排序后 [-500, 100, 300, 900]，中位数取中间两值 100 与 300 的平均
        assertEquals(200, service.get(1L, null).getOffsetMs());
    }

    @Test
    void evenReportCountRoundsHalfUp() {
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(500), row(-100), row(1), row(0)));

        assertEquals(1, service.get(1L, null).getOffsetMs());
    }

    @Test
    void getReturnsOwnReportForSignedInUser() {
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(100), row(800), row(1500)));
        LyricOffsetCorrection mine = row(1500);
        mine.setUserId(7L);
        mine.setSongId(1L);
        when(correctionMapper.selectOne(any())).thenReturn(mine);

        LyricOffsetVO vo = service.get(1L, 7L);

        assertEquals(800, vo.getOffsetMs());
        assertEquals(1500, vo.getMine());
    }

    @Test
    void submitInsertsFirstCorrection() {
        when(songMapper.selectById(1L)).thenReturn(song(1L));
        when(correctionMapper.selectOne(any())).thenReturn(null);
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(500)));

        LyricOffsetVO vo = service.submit(7L, submit(1L, 500));

        ArgumentCaptor<LyricOffsetCorrection> inserted = ArgumentCaptor.forClass(LyricOffsetCorrection.class);
        verify(correctionMapper).insert(inserted.capture());
        assertEquals(7L, inserted.getValue().getUserId());
        assertEquals(1L, inserted.getValue().getSongId());
        assertEquals(500, inserted.getValue().getOffsetMs());
        // 只有 1 份上报，未达共识门槛：只回填条数，不下发共识值
        assertEquals(1, vo.getCount());
        assertNull(vo.getOffsetMs());
    }

    @Test
    void submitOverridesThePreviousOffset() {
        when(songMapper.selectById(1L)).thenReturn(song(1L));
        LyricOffsetCorrection existing = row(100);
        existing.setId(77L);
        existing.setUserId(7L);
        existing.setSongId(1L);
        when(correctionMapper.selectOne(any())).thenReturn(existing);
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(300)));

        service.submit(7L, submit(1L, 300));

        ArgumentCaptor<LyricOffsetCorrection> patch = ArgumentCaptor.forClass(LyricOffsetCorrection.class);
        verify(correctionMapper).updateById(patch.capture());
        assertEquals(77L, patch.getValue().getId());
        assertEquals(300, patch.getValue().getOffsetMs());
        verify(correctionMapper, never()).insert(any(LyricOffsetCorrection.class));
    }

    @Test
    void submitWithTheSameOffsetWritesNothing() {
        when(songMapper.selectById(1L)).thenReturn(song(1L));
        LyricOffsetCorrection existing = row(300);
        existing.setId(77L);
        existing.setUserId(7L);
        existing.setSongId(1L);
        when(correctionMapper.selectOne(any())).thenReturn(existing);
        when(correctionMapper.selectList(any())).thenReturn(List.of(row(300)));

        service.submit(7L, submit(1L, 300));

        verify(correctionMapper, never()).insert(any(LyricOffsetCorrection.class));
        verify(correctionMapper, never()).updateById(any(LyricOffsetCorrection.class));
    }

    @Test
    void submitClampsOffsetIntoRange() {
        when(songMapper.selectById(1L)).thenReturn(song(1L));
        when(correctionMapper.selectOne(any())).thenReturn(null);
        when(correctionMapper.selectList(any())).thenReturn(new ArrayList<>());

        service.submit(7L, submit(1L, 99999));

        ArgumentCaptor<LyricOffsetCorrection> upper = ArgumentCaptor.forClass(LyricOffsetCorrection.class);
        verify(correctionMapper).insert(upper.capture());
        assertEquals(LyricOffsetService.LIMIT_MS, upper.getValue().getOffsetMs());

        service.submit(7L, submit(1L, -99999));

        ArgumentCaptor<LyricOffsetCorrection> lower = ArgumentCaptor.forClass(LyricOffsetCorrection.class);
        verify(correctionMapper, times(2)).insert(lower.capture());
        assertEquals(-LyricOffsetService.LIMIT_MS, lower.getAllValues().get(1).getOffsetMs());
    }

    @Test
    void submitRejectsUnknownOrMissingSong() {
        when(songMapper.selectById(9L)).thenReturn(null);

        BusinessException missing = assertThrows(BusinessException.class, () -> service.submit(7L, submit(9L, 100)));
        assertEquals(400, missing.getCode());
        assertEquals("歌曲不存在或已下架", missing.getMsg());
        verifyNoInteractions(correctionMapper);

        BusinessException noId = assertThrows(BusinessException.class, () -> service.submit(7L, submit(null, 100)));
        assertEquals("歌曲 id 不能为空", noId.getMsg());
    }

    @Test
    void withdrawDeletesOnlyTheCallersRow() {
        when(songMapper.selectById(1L)).thenReturn(song(1L));

        service.withdraw(7L, 1L);

        verify(correctionMapper).delete(any());
    }

    @Test
    void withdrawRejectsUnknownSong() {
        when(songMapper.selectById(9L)).thenReturn(null);

        assertEquals("歌曲不存在或已下架", assertThrows(BusinessException.class, () -> service.withdraw(7L, 9L)).getMsg());
        verify(correctionMapper, never()).delete(any());
    }

    private static LyricOffsetSubmitDTO submit(Long songId, Integer offsetMs) {
        LyricOffsetSubmitDTO dto = new LyricOffsetSubmitDTO();
        dto.setSongId(songId);
        dto.setOffsetMs(offsetMs);
        return dto;
    }

    private static LyricOffsetCorrection row(Integer offsetMs) {
        LyricOffsetCorrection row = new LyricOffsetCorrection();
        row.setOffsetMs(offsetMs);
        return row;
    }

    private static Song song(Long id) {
        Song song = new Song();
        song.setId(id);
        song.setTitle("歌曲" + id);
        song.setStatus(1);
        return song;
    }
}

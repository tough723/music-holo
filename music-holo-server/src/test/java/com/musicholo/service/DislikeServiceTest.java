package com.musicholo.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Singer;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserSingerDislike;
import com.musicholo.entity.UserSongDislike;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserSingerDislikeMapper;
import com.musicholo.mapper.UserSongDislikeMapper;
import com.musicholo.vo.DislikeSummaryVO;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DislikeServiceTest {

    @Mock private UserSongDislikeMapper songDislikeMapper;
    @Mock private UserSingerDislikeMapper singerDislikeMapper;
    @Mock private SongMapper songMapper;
    @Mock private SingerMapper singerMapper;

    private DislikeService service;

    @BeforeAll
    static void registerMybatisLambdaMetadata() {
        register(UserSongDislike.class);
        register(UserSingerDislike.class);
        register(Song.class);
        register(Singer.class);
    }

    private static void register(Class<?> entityType) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityType.getName());
        assistant.setCurrentNamespace(entityType.getName() + "Mapper");
        TableInfoHelper.initTableInfo(assistant, entityType);
    }

    @BeforeEach
    void setUp() {
        service = new DislikeService(songDislikeMapper, singerDislikeMapper, songMapper, singerMapper);
    }

    @Test
    void addSongIsIdempotentAndDoesNotInsertTwice() {
        when(songMapper.selectById(9L)).thenReturn(song(9L, 3L));
        UserSongDislike existing = rule(9L);
        when(songDislikeMapper.selectList(any())).thenReturn(List.of(existing));

        service.addSong(2L, 9L);

        verify(songDislikeMapper, never()).insert(any(UserSongDislike.class));
    }

    @Test
    void addSongRejectsMissingSongAndAccountLimit() {
        when(songMapper.selectById(9L)).thenReturn(null);
        BusinessException missing = assertThrows(BusinessException.class, () -> service.addSong(2L, 9L));
        assertEquals(400, missing.getCode());
        assertEquals("歌曲不存在", missing.getMsg());

        when(songMapper.selectById(8L)).thenReturn(song(8L, 1L));
        List<UserSongDislike> full = new ArrayList<>();
        for (int i = 0; i < DislikeService.MAX_SONGS; i++) {
            full.add(rule(1000L + i));
        }
        when(songDislikeMapper.selectList(any())).thenReturn(full);
        BusinessException limited = assertThrows(BusinessException.class, () -> service.addSong(2L, 8L));
        assertEquals("不喜欢的歌曲已达 500 首上限", limited.getMsg());
        verify(songDislikeMapper, never()).insert(any(UserSongDislike.class));
    }

    @Test
    void concurrentDuplicateSongInsertIsSuccess() {
        when(songMapper.selectById(9L)).thenReturn(song(9L, 1L));
        when(songDislikeMapper.selectList(any())).thenReturn(List.of());
        when(songDislikeMapper.insert(any(UserSongDislike.class))).thenThrow(new DuplicateKeyException("dup"));

        assertDoesNotThrow(() -> service.addSong(2L, 9L));
    }

    @Test
    void addSingerRejectsMissingAndDuplicateDoesNotInsert() {
        when(singerMapper.selectById(4L)).thenReturn(null);
        assertEquals("歌手不存在", assertThrows(BusinessException.class, () -> service.addSinger(2L, 4L)).getMsg());

        when(singerMapper.selectById(3L)).thenReturn(singer(3L, "KAIN"));
        UserSingerDislike existing = new UserSingerDislike();
        existing.setSingerId(3L);
        when(singerDislikeMapper.selectList(any())).thenReturn(List.of(existing));
        service.addSinger(2L, 3L);
        verify(singerDislikeMapper, never()).insert(any(UserSingerDislike.class));
    }

    @Test
    void anonymousRulesAreEmptyAndDoNotReadOtherAccounts() {
        assertTrue(service.rules(null).isEmpty());
        verifyNoInteractions(songDislikeMapper, singerDislikeMapper);
    }

    @Test
    void summaryKeepsRevocableIdsWhenSongWasRemoved() {
        UserSongDislike songRule = rule(9L);
        when(songDislikeMapper.selectList(any())).thenReturn(List.of(songRule));
        when(songMapper.selectBatchIds(any())).thenReturn(List.of());
        UserSingerDislike singerRule = new UserSingerDislike();
        singerRule.setId(2L);
        singerRule.setSingerId(6L);
        when(singerDislikeMapper.selectList(any())).thenReturn(List.of(singerRule));
        when(singerMapper.selectBatchIds(any())).thenReturn(List.of(singer(6L, "DJ Nova")));

        DislikeSummaryVO summary = service.summary(2L);

        assertEquals(List.of(9L), summary.getSongIds());
        assertEquals("已下架或已删除的歌曲", summary.getSongs().get(0).getTitle());
        assertEquals("DJ Nova", summary.getSingers().get(0).getName());
        assertEquals(DislikeService.MAX_SONGS, summary.getSongLimit());
        assertEquals(DislikeService.MAX_SINGERS, summary.getSingerLimit());
    }

    @Test
    void removeIsScopedByUserAndSong() {
        service.removeSong(2L, 9L);
        verify(songDislikeMapper).delete(any());
        service.removeSinger(2L, 3L);
        verify(singerDislikeMapper).delete(any());
    }

    private static UserSongDislike rule(Long songId) {
        UserSongDislike row = new UserSongDislike();
        row.setId(songId);
        row.setUserId(2L);
        row.setSongId(songId);
        return row;
    }

    private static Song song(Long id, Long singerId) {
        Song song = new Song();
        song.setId(id);
        song.setSingerId(singerId);
        song.setTitle("歌曲" + id);
        song.setStatus(1);
        return song;
    }

    private static Singer singer(Long id, String name) {
        Singer singer = new Singer();
        singer.setId(id);
        singer.setName(name);
        singer.setRegion("内地");
        return singer;
    }
}

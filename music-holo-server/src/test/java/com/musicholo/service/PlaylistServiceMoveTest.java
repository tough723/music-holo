package com.musicholo.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.PlaylistSong;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.PlaylistSongMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.SysUserMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlaylistServiceMoveTest {

    @Mock private PlaylistMapper playlistMapper;
    @Mock private PlaylistSongMapper playlistSongMapper;
    @Mock private SongMapper songMapper;
    @Mock private SysUserMapper sysUserMapper;
    @Mock private UserService userService;
    @Mock private SongAssembler songAssembler;

    private PlaylistService service;

    @BeforeAll
    static void registerMybatisLambdaMetadata() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), PlaylistSong.class.getName());
        assistant.setCurrentNamespace(PlaylistSong.class.getName() + "Mapper");
        TableInfoHelper.initTableInfo(assistant, PlaylistSong.class);
    }

    @BeforeEach
    void setUp() {
        service = new PlaylistService(playlistMapper, playlistSongMapper, songMapper, sysUserMapper, userService, songAssembler);
    }

    @Test
    void creatorMoveRewritesEqualSortsToSequentialOrder() {
        when(playlistMapper.selectById(3L)).thenReturn(playlist(3L, 2L));
        PlaylistSong first = relation(10L, 2L, 5);
        PlaylistSong second = relation(11L, 1L, 5);
        PlaylistSong third = relation(12L, 7L, 5);
        when(playlistSongMapper.selectList(any())).thenReturn(List.of(first, second, third));

        assertEquals(List.of(1L, 2L, 7L), service.moveSong(3L, 1L, -1, 2L));

        ArgumentCaptor<PlaylistSong> saved = ArgumentCaptor.forClass(PlaylistSong.class);
        verify(playlistSongMapper, times(3)).updateById(saved.capture());
        assertEquals(List.of(1L, 2L, 7L), saved.getAllValues().stream().map(PlaylistSong::getSongId).toList());
        assertEquals(List.of(1, 2, 3), saved.getAllValues().stream().map(PlaylistSong::getSort).toList());
        verify(userService, never()).isAdmin(any());
    }

    @Test
    void boundaryMoveDoesNotWrite() {
        when(playlistMapper.selectById(3L)).thenReturn(playlist(3L, 2L));
        when(playlistSongMapper.selectList(any())).thenReturn(List.of(
                relation(10L, 1L, 1), relation(11L, 2L, 2), relation(12L, 7L, 3)));

        assertEquals(List.of(1L, 2L, 7L), service.moveSong(3L, 1L, -1, 2L));
        verify(playlistSongMapper, never()).updateById(any());
    }

    @Test
    void adminCannotReorderSomeoneElsesPlaylist() {
        when(playlistMapper.selectById(3L)).thenReturn(playlist(3L, 2L));
        lenient().when(userService.isAdmin(1L)).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.moveSong(3L, 1L, 1, 1L));
        assertEquals(403, ex.getCode());
        assertEquals("只能调整自己创建的歌单顺序", ex.getMsg());
        verify(playlistSongMapper, never()).selectList(any());
        verify(playlistSongMapper, never()).updateById(any());
    }

    @Test
    void missingSongAndInvalidDirectionAreRejected() {
        when(playlistMapper.selectById(3L)).thenReturn(playlist(3L, 2L));
        when(playlistSongMapper.selectList(any())).thenReturn(List.of(relation(10L, 1L, 1)));

        BusinessException missing = assertThrows(BusinessException.class, () -> service.moveSong(3L, 9L, 1, 2L));
        assertEquals(400, missing.getCode());
        assertEquals("歌曲不在歌单中", missing.getMsg());

        BusinessException direction = assertThrows(BusinessException.class, () -> service.moveSong(3L, 1L, 2, 2L));
        assertEquals(400, direction.getCode());
        verify(playlistSongMapper, never()).updateById(any());
    }

    private static Playlist playlist(Long id, Long creatorId) {
        Playlist playlist = new Playlist();
        playlist.setId(id);
        playlist.setCreatorId(creatorId);
        return playlist;
    }

    private static PlaylistSong relation(Long id, Long songId, Integer sort) {
        PlaylistSong relation = new PlaylistSong();
        relation.setId(id);
        relation.setPlaylistId(3L);
        relation.setSongId(songId);
        relation.setSort(sort);
        return relation;
    }
}

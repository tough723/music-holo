package com.musicholo.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserFavorite;
import com.musicholo.entity.UserPlayHistory;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserFavoriteMapper;
import com.musicholo.mapper.UserPlayHistoryMapper;
import com.musicholo.vo.SongVO;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecommendationServiceTest {

    @Mock private SongMapper songMapper;
    @Mock private UserPlayHistoryMapper historyMapper;
    @Mock private UserFavoriteMapper favoriteMapper;
    @Mock private SongAssembler songAssembler;
    @Mock private DislikeService dislikeService;

    private RecommendationService service;

    @BeforeAll
    static void registerMybatisLambdaMetadata() {
        register(Song.class);
        register(UserPlayHistory.class);
        register(UserFavorite.class);
    }

    private static void register(Class<?> entityType) {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), entityType.getName());
        assistant.setCurrentNamespace(entityType.getName() + "Mapper");
        TableInfoHelper.initTableInfo(assistant, entityType);
    }

    @BeforeEach
    void setUp() {
        service = new RecommendationService(songMapper, historyMapper, favoriteMapper, songAssembler, dislikeService);
        when(songAssembler.toVOList(anyList())).thenAnswer(invocation -> {
            List<Song> songs = invocation.getArgument(0);
            return songs.stream().map(song -> {
                SongVO vo = new SongVO();
                vo.setId(song.getId());
                vo.setSingerId(song.getSingerId());
                vo.setTitle(song.getTitle());
                return vo;
            }).toList();
        });
    }

    @Test
    void anonymousRecommendationsDoNotReadDislikeRules() {
        when(songMapper.selectList(any())).thenReturn(List.of(song(1L, 1L), song(2L, 2L)));

        List<SongVO> result = service.songs(null, 8);

        assertEquals(List.of(1L, 2L), result.stream().map(SongVO::getId).toList());
        verifyNoInteractions(dislikeService, historyMapper, favoriteMapper);
    }

    @Test
    void dailyRecommendationsDropDislikedSongsAndSingers() {
        when(historyMapper.selectList(any())).thenReturn(List.of());
        when(favoriteMapper.selectList(any())).thenReturn(List.of());
        when(dislikeService.rules(7L)).thenReturn(DislikeRules.of(Set.of(2L), Set.of(3L)));
        when(songMapper.selectList(any())).thenReturn(List.of(
                song(1L, 1L), song(2L, 2L), song(3L, 3L), song(4L, 9L)));

        List<Long> ids = service.songs(7L, 8).stream().map(SongVO::getId).toList();

        assertEquals(List.of(1L, 4L), ids);
    }

    @Test
    void similarRadioSkipsDislikedSingerButKeepsManualSourceLookupSeparate() {
        when(songMapper.selectById(1L)).thenReturn(song(1L, 1L));
        when(dislikeService.rules(7L)).thenReturn(DislikeRules.of(Set.of(9L), Set.of(1L)));
        when(songMapper.selectList(any())).thenReturn(List.of(
                song(1L, 1L), song(3L, 1L), song(9L, 2L), song(2L, 2L)));

        List<Long> ids = service.similar(1L, 8, 7L).stream().map(SongVO::getId).toList();

        assertTrue(ids.contains(2L));
        assertTrue(ids.stream().noneMatch(id -> id == 1L || id == 3L || id == 9L));
    }

    private static Song song(Long id, Long singerId) {
        Song song = new Song();
        song.setId(id);
        song.setSingerId(singerId);
        song.setCategoryId(1L);
        song.setTitle("歌曲" + id);
        song.setStatus(1);
        song.setPlayCount(id);
        return song;
    }
}

package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.PlaylistBackupDTO;
import com.musicholo.dto.PlaylistBackupImportRequestDTO;
import com.musicholo.dto.PlaylistBackupPlaylistDTO;
import com.musicholo.dto.PlaylistBackupSongDTO;
import com.musicholo.dto.PlaylistBackupTrackChoiceDTO;
import com.musicholo.dto.PlaylistSaveDTO;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.PlaylistSong;
import com.musicholo.entity.Song;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.PlaylistSongMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.PlaylistVO;
import com.musicholo.vo.SongVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlaylistBackupServiceTest {

    @Mock private PlaylistMapper playlistMapper;
    @Mock private PlaylistSongMapper playlistSongMapper;
    @Mock private SongMapper songMapper;
    @Mock private SongAssembler songAssembler;
    @Mock private PlaylistService playlistService;

    private PlaylistBackupService service;

    @BeforeEach
    void setUp() {
        service = new PlaylistBackupService(
                playlistMapper,
                playlistSongMapper,
                songMapper,
                songAssembler,
                playlistService,
                new ObjectMapper());
    }

    @Test
    void exportContainsOnlyAllowListedSongMetadata() throws Exception {
        Playlist playlist = new Playlist();
        playlist.setId(91L);
        playlist.setCreatorId(7L);
        playlist.setName("私人夜航");
        playlist.setDescription("only my list");
        playlist.setIsPublic(0);
        when(playlistMapper.selectList(any(Wrapper.class))).thenReturn(List.of(playlist));

        PlaylistSong relation = new PlaylistSong();
        relation.setPlaylistId(91L);
        relation.setSongId(41L);
        relation.setSort(1);
        when(playlistSongMapper.selectList(any(Wrapper.class))).thenReturn(List.of(relation));

        Song song = new Song();
        song.setId(41L);
        song.setTitle("霓虹海");
        song.setAlbum("《霓虹海》");
        song.setDuration(120);
        song.setStatus(1);
        song.setAudioUrl("/audio/not-in-backup.wav");
        song.setLyric("not in backup");
        when(songMapper.selectBatchIds(anyCollection())).thenReturn(List.of(song));

        SongVO view = new SongVO();
        view.setId(41L);
        view.setTitle("霓虹海");
        view.setSingerName("林澈");
        view.setAlbum("《霓虹海》");
        view.setDuration(120);
        view.setStatus(1);
        when(songAssembler.toVOList(anyList())).thenReturn(List.of(view));

        PlaylistBackupDTO backup = service.exportOwn(7L);

        assertEquals(PlaylistBackupDTO.FORMAT, backup.getFormat());
        assertEquals(1, backup.getVersion());
        assertEquals("私人夜航", backup.getPlaylists().get(0).getName());
        assertEquals(false, backup.getPlaylists().get(0).getSourcePublic());
        assertEquals("41", backup.getPlaylists().get(0).getSongs().get(0).getId());
        String json = new ObjectMapper().writeValueAsString(backup);
        org.junit.jupiter.api.Assertions.assertFalse(json.contains("audioUrl"));
        org.junit.jupiter.api.Assertions.assertFalse(json.contains("not in backup"));
    }

    @Test
    void rejectsUnknownBackupVersionsBeforeReadingCatalog() {
        PlaylistBackupDTO backup = validBackup();
        backup.setVersion(2);

        BusinessException error = assertThrows(BusinessException.class, () -> service.preview(backup, 7L));

        assertEquals(400, error.getCode());
        verifyNoInteractions(playlistMapper, playlistSongMapper, songMapper, songAssembler);
    }

    @Test
    void reportsAmbiguousMetadataMatchesForUserConfirmation() {
        PlaylistBackupDTO backup = validBackup();
        PlaylistBackupPlaylistDTO playlist = new PlaylistBackupPlaylistDTO();
        playlist.setName("重名候选");
        PlaylistBackupSongDTO track = new PlaylistBackupSongDTO();
        track.setTitle("同名曲目");
        track.setSingerName("");
        track.setAlbum("");
        playlist.setSongs(List.of(track));
        backup.setPlaylists(List.of(playlist));

        Song first = availableSong(1L, "同名曲目");
        Song second = availableSong(2L, "同名曲目");
        when(songMapper.selectList(any(Wrapper.class))).thenReturn(List.of(first, second));
        when(playlistMapper.selectList(any(Wrapper.class))).thenReturn(List.of());

        SongVO firstView = catalogView(1L, "同名曲目");
        SongVO secondView = catalogView(2L, "同名曲目");
        when(songAssembler.toVOList(anyList())).thenReturn(List.of(firstView, secondView));

        var preview = service.preview(backup, 7L);

        assertEquals("ambiguous", preview.getPlaylists().get(0).getTracks().get(0).getStatus());
        assertEquals(List.of("1", "2"), preview.getPlaylists().get(0).getTracks().get(0).getCandidates()
                .stream().map(candidate -> candidate.getId()).toList());
    }

    @Test
    void importsAnExplicitAmbiguousMatchAndMakesThePlaylistPublicOnlyWhenSelected() {
        PlaylistBackupDTO backup = validBackup();
        PlaylistBackupPlaylistDTO playlist = new PlaylistBackupPlaylistDTO();
        playlist.setName("重名候选");
        PlaylistBackupSongDTO track = new PlaylistBackupSongDTO();
        track.setTitle("同名曲目");
        track.setSingerName("");
        track.setAlbum("");
        playlist.setSongs(List.of(track));
        backup.setPlaylists(List.of(playlist));

        Song first = availableSong(1L, "同名曲目");
        Song second = availableSong(2L, "同名曲目");
        when(songMapper.selectList(any(Wrapper.class))).thenReturn(List.of(first, second));
        when(playlistMapper.selectList(any(Wrapper.class))).thenReturn(List.of());
        when(songAssembler.toVOList(anyList())).thenReturn(List.of(
                catalogView(1L, "同名曲目"), catalogView(2L, "同名曲目")));

        PlaylistVO created = new PlaylistVO();
        created.setId(99L);
        when(playlistService.save(any(PlaylistSaveDTO.class), eq(7L))).thenReturn(created);
        when(playlistService.addSongs(99L, List.of(2L), 7L)).thenReturn(1);

        PlaylistBackupTrackChoiceDTO choice = new PlaylistBackupTrackChoiceDTO();
        choice.setPlaylistIndex(0);
        choice.setTrackIndex(0);
        choice.setSongId("2");
        PlaylistBackupImportRequestDTO request = new PlaylistBackupImportRequestDTO();
        request.setBackup(backup);
        request.setSelectedPlaylistIndexes(List.of(0));
        request.setPublicPlaylistIndexes(List.of(0));
        request.setTrackChoices(List.of(choice));

        var result = service.importSelected(request, 7L);

        assertEquals(1, result.getImportedPlaylistCount());
        assertEquals(1, result.getImportedSongCount());
        assertEquals(true, result.getPlaylists().get(0).getIsPublic());
        verify(playlistService).save(org.mockito.ArgumentMatchers.argThat(save -> save.getIsPublic() == 1), eq(7L));
        verify(playlistService).addSongs(99L, List.of(2L), 7L);
    }

    @Test
    void rejectsIndexesThatDoNotReferToAnExportedPlaylist() {
        PlaylistBackupImportRequestDTO request = new PlaylistBackupImportRequestDTO();
        request.setBackup(validBackup());
        request.setSelectedPlaylistIndexes(List.of(1));
        request.setPublicPlaylistIndexes(List.of());

        BusinessException error = assertThrows(BusinessException.class, () -> service.importSelected(request, 7L));

        assertEquals(400, error.getCode());
        verifyNoInteractions(playlistMapper, playlistSongMapper, songMapper, songAssembler, playlistService);
    }

    private Song availableSong(Long id, String title) {
        Song song = new Song();
        song.setId(id);
        song.setTitle(title);
        song.setStatus(1);
        return song;
    }

    private SongVO catalogView(Long id, String title) {
        SongVO view = new SongVO();
        view.setId(id);
        view.setTitle(title);
        view.setSingerName("");
        view.setAlbum("");
        view.setStatus(1);
        return view;
    }

    private PlaylistBackupDTO validBackup() {
        PlaylistBackupDTO backup = new PlaylistBackupDTO();
        backup.setFormat(PlaylistBackupDTO.FORMAT);
        backup.setVersion(PlaylistBackupDTO.VERSION);
        backup.setExportedAt("2026-10-09T08:00:00Z");
        PlaylistBackupPlaylistDTO playlist = new PlaylistBackupPlaylistDTO();
        playlist.setName("夜航");
        playlist.setDescription("");
        playlist.setSongs(List.of());
        backup.setPlaylists(List.of(playlist));
        return backup;
    }
}

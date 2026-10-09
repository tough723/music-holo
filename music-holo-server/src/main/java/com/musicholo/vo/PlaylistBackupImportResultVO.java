package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PlaylistBackupImportResultVO implements Serializable {

    private Integer importedPlaylistCount;
    private Integer importedSongCount;
    private Integer missingSongCount;
    private Integer ambiguousSkippedCount;
    private List<PlaylistBackupImportedPlaylistVO> playlists = new ArrayList<>();
}

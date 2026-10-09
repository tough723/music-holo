package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PlaylistBackupPreviewVO implements Serializable {

    private Integer playlistCount;
    private Integer totalSongCount;
    private Integer matchedSongCount;
    private Integer missingSongCount;
    private Integer ambiguousSongCount;
    private List<PlaylistBackupPlaylistPreviewVO> playlists = new ArrayList<>();
}

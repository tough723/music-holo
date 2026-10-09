package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;

@Data
public class PlaylistBackupImportedPlaylistVO implements Serializable {

    private String playlistId;
    private String sourceName;
    private String importedName;
    private Integer addedSongCount;
    private Integer missingSongCount;
    private Integer ambiguousSkippedCount;
    private Boolean isPublic;
}

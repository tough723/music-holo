package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PlaylistBackupPlaylistPreviewVO implements Serializable {

    private Integer index;
    private String name;
    private String description;
    private Boolean sourcePublic;
    private String suggestedName;
    private Boolean nameConflict;
    private Integer totalSongCount;
    private Integer matchedSongCount;
    private Integer missingSongCount;
    private Integer ambiguousSongCount;
    private List<PlaylistBackupTrackPreviewVO> tracks = new ArrayList<>();
}

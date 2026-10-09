package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class PlaylistBackupTrackPreviewVO implements Serializable {

    private Integer index;
    private String title;
    private String singerName;
    private String album;
    /** matched, ambiguous, or missing */
    private String status;
    private String resolvedSongId;
    private List<PlaylistBackupCandidateVO> candidates = new ArrayList<>();
}

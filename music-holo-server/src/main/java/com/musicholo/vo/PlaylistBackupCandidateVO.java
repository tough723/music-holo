package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;

@Data
public class PlaylistBackupCandidateVO implements Serializable {

    private String id;
    private String title;
    private String singerName;
    private String album;
}

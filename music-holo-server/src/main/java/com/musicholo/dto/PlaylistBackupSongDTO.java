package com.musicholo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/** Only catalog identity hints are exported. Media URLs and lyrics are intentionally absent. */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class PlaylistBackupSongDTO implements Serializable {

    /** String avoids precision loss for 64-bit catalog IDs in JavaScript JSON consumers. */
    @Size(max = 20)
    private String id;

    @Size(max = 200)
    private String title;

    @Size(max = 120)
    private String singerName;

    @Size(max = 200)
    private String album;

    @Min(0)
    private Integer duration;
}

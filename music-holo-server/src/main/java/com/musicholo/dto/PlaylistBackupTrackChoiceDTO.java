package com.musicholo.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/** User-selected catalog match for an ambiguous source track. */
@Data
public class PlaylistBackupTrackChoiceDTO implements Serializable {

    @NotNull
    @Min(0)
    private Integer playlistIndex;

    @NotNull
    @Min(0)
    private Integer trackIndex;

    @NotBlank
    @Size(max = 20)
    private String songId;
}

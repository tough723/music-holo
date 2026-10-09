package com.musicholo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** Versioned, allow-listed portable backup for a user's playlists. */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class PlaylistBackupDTO implements Serializable {

    public static final String FORMAT = "music-holo-playlists";
    public static final int VERSION = 1;

    @NotBlank
    @Size(max = 64)
    private String format;

    @NotNull
    private Integer version;

    @NotBlank
    @Size(max = 40)
    private String exportedAt;

    @NotNull
    @Size(max = 200)
    @Valid
    private List<PlaylistBackupPlaylistDTO> playlists = new ArrayList<>();
}

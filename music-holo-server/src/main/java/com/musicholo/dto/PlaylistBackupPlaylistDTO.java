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

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class PlaylistBackupPlaylistDTO implements Serializable {

    @NotBlank
    @Size(max = 100)
    private String name;

    @Size(max = 500)
    private String description;

    /** Informational only; imports are private unless the user explicitly opts in. */
    private Boolean sourcePublic;

    @NotNull
    @Size(max = 2000)
    @Valid
    private List<PlaylistBackupSongDTO> songs = new ArrayList<>();
}

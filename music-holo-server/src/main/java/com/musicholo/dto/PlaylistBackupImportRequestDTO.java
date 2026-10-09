package com.musicholo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class PlaylistBackupImportRequestDTO implements Serializable {

    @NotNull
    @Valid
    private PlaylistBackupDTO backup;

    /** Zero-based source playlist indexes selected in the user's preview. */
    @NotEmpty
    @Size(max = 200)
    private List<Integer> selectedPlaylistIndexes = new ArrayList<>();

    /** Only indexes explicitly checked as public by the user. */
    @Size(max = 200)
    private List<Integer> publicPlaylistIndexes = new ArrayList<>();

    @Size(max = 10000)
    @Valid
    private List<PlaylistBackupTrackChoiceDTO> trackChoices = new ArrayList<>();
}

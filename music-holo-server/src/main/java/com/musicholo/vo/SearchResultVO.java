package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** 全局搜索聚合结果 */
@Data
public class SearchResultVO implements Serializable {

    private String keyword;

    private List<SongVO> songs = new ArrayList<>();

    private List<SingerVO> singers = new ArrayList<>();

    private List<PlaylistVO> playlists = new ArrayList<>();
}

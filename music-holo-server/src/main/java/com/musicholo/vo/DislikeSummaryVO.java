package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * 当前账号的不喜欢规则。歌曲和歌手分开保存，撤销任一侧不影响另一侧。
 */
@Data
public class DislikeSummaryVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 用于自动跳过的歌曲 id，含已下架曲目，便于撤销 */
    private List<Long> songIds = new ArrayList<>();

    /** 用于自动跳过的歌手 id */
    private List<Long> singerIds = new ArrayList<>();

    private Integer songLimit;

    private Integer singerLimit;

    private List<SongRule> songs = new ArrayList<>();

    private List<SingerRule> singers = new ArrayList<>();

    @Data
    public static class SongRule implements Serializable {
        private static final long serialVersionUID = 1L;
        private Long id;
        private String title;
        private Long singerId;
        private String singerName;
        private String cover;
    }

    @Data
    public static class SingerRule implements Serializable {
        private static final long serialVersionUID = 1L;
        private Long id;
        private String name;
        private String avatar;
        private String region;
    }
}

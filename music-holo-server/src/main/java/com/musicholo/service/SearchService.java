package com.musicholo.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.dto.PlaylistQuery;
import com.musicholo.entity.Singer;
import com.musicholo.entity.Song;
import com.musicholo.mapper.SingerMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.PlaylistVO;
import com.musicholo.vo.SearchResultVO;
import com.musicholo.vo.SingerVO;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/** 跨内容类型搜索：歌曲/歌词/歌手/歌单 */
@Service
@RequiredArgsConstructor
public class SearchService {

    private final SongMapper songMapper;
    private final SingerMapper singerMapper;
    private final SongAssembler songAssembler;
    private final PlaylistService playlistService;

    public SearchResultVO search(String rawKeyword, Integer requestedLimit, Long currentUserId) {
        String keyword = StrUtil.trim(rawKeyword);
        SearchResultVO result = new SearchResultVO();
        result.setKeyword(keyword);
        if (StrUtil.isBlank(keyword)) {
            return result;
        }
        int limit = Math.max(1, Math.min(requestedLimit == null ? 8 : requestedLimit, 20));

        List<Singer> singers = singerMapper.selectList(new LambdaQueryWrapper<Singer>()
                .eq(Singer::getStatus, 1)
                .like(Singer::getName, keyword)
                .orderByAsc(Singer::getSort)
                .orderByDesc(Singer::getId)
                .last("LIMIT " + limit));
        List<Long> singerIds = singers.stream().map(Singer::getId).collect(Collectors.toList());
        List<SingerVO> singerVOs = new ArrayList<>();
        for (Singer singer : singers) {
            SingerVO vo = BeanUtil.copyProperties(singer, SingerVO.class);
            Long count = songMapper.selectCount(new LambdaQueryWrapper<Song>()
                    .eq(Song::getSingerId, singer.getId()).eq(Song::getStatus, 1));
            vo.setSongCount(count == null ? 0L : count);
            singerVOs.add(vo);
        }

        LambdaQueryWrapper<Song> songQuery = new LambdaQueryWrapper<Song>()
                .eq(Song::getStatus, 1)
                .and(w -> {
                    w.like(Song::getTitle, keyword)
                            .or().like(Song::getAlbum, keyword)
                            .or().like(Song::getLyric, keyword);
                    if (!singerIds.isEmpty()) {
                        w.or().in(Song::getSingerId, singerIds);
                    }
                })
                .orderByDesc(Song::getPlayCount)
                .orderByDesc(Song::getId)
                .last("LIMIT " + limit);
        List<SongVO> songVOs = songAssembler.toVOList(songMapper.selectList(songQuery));
        songVOs.forEach(song -> song.setLyric(null));

        PlaylistQuery playlistQuery = new PlaylistQuery();
        playlistQuery.setKeyword(keyword);
        playlistQuery.setPageNum(1);
        playlistQuery.setPageSize(limit);
        Page<PlaylistVO> playlistPage = playlistService.page(playlistQuery, currentUserId);

        result.setSongs(songVOs);
        result.setSingers(singerVOs);
        result.setPlaylists(playlistPage.getRecords());
        return result;
    }
}

package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.entity.Song;
import com.musicholo.entity.UserFavorite;
import com.musicholo.entity.UserPlayHistory;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.UserFavoriteMapper;
import com.musicholo.mapper.UserPlayHistoryMapper;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** 可解释的内容推荐基线：优先相似歌手/分类，热度榜用于补齐与冷启动。登录用户的不喜欢规则不参与补齐。 */
@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final SongMapper songMapper;
    private final UserPlayHistoryMapper historyMapper;
    private final UserFavoriteMapper favoriteMapper;
    private final SongAssembler songAssembler;
    private final DislikeService dislikeService;

    public List<SongVO> songs(Long userId, Integer requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit == null ? 8 : requestedLimit, 24));
        Map<Long, Integer> singerWeights = new HashMap<>();
        Map<Long, Integer> categoryWeights = new HashMap<>();
        Set<Long> excluded = new HashSet<>();
        DislikeRules dislikes = dislikeRules(userId);
        excluded.addAll(dislikes.songIds());

        if (userId != null) {
            List<UserPlayHistory> recent = historyMapper.selectList(new LambdaQueryWrapper<UserPlayHistory>()
                    .eq(UserPlayHistory::getUserId, userId)
                    .orderByDesc(UserPlayHistory::getLastPlayedAt)
                    .last("LIMIT 20"));
            List<UserFavorite> favorites = favoriteMapper.selectList(new LambdaQueryWrapper<UserFavorite>()
                    .eq(UserFavorite::getUserId, userId)
                    .orderByDesc(UserFavorite::getCreateTime)
                    .last("LIMIT 50"));

            List<Long> seedIds = new ArrayList<>();
            for (int i = 0; i < recent.size(); i++) {
                UserPlayHistory row = recent.get(i);
                seedIds.add(row.getSongId());
                if (i < 5) excluded.add(row.getSongId());
            }
            for (UserFavorite favorite : favorites) {
                seedIds.add(favorite.getSongId());
                excluded.add(favorite.getSongId());
            }

            if (!seedIds.isEmpty()) {
                for (Song seed : songMapper.selectBatchIds(seedIds.stream().distinct().collect(Collectors.toList()))) {
                    if (seed.getSingerId() != null && !dislikes.matchesSinger(seed.getSingerId())) {
                        singerWeights.merge(seed.getSingerId(), 1, Integer::sum);
                    }
                    if (seed.getCategoryId() != null) {
                        categoryWeights.merge(seed.getCategoryId(), 1, Integer::sum);
                    }
                }
            }
        }

        List<Song> recommendations = new ArrayList<>();
        if (!singerWeights.isEmpty() || !categoryWeights.isEmpty()) {
            LambdaQueryWrapper<Song> similarQuery = new LambdaQueryWrapper<Song>()
                    .eq(Song::getStatus, 1)
                    .and(w -> {
                        boolean hasCondition = false;
                        if (!categoryWeights.isEmpty()) {
                            w.in(Song::getCategoryId, categoryWeights.keySet());
                            hasCondition = true;
                        }
                        if (!singerWeights.isEmpty()) {
                            if (hasCondition) w.or();
                            w.in(Song::getSingerId, singerWeights.keySet());
                        }
                    });
            if (!excluded.isEmpty()) similarQuery.notIn(Song::getId, excluded);
            if (!dislikes.singerIds().isEmpty()) similarQuery.notIn(Song::getSingerId, dislikes.singerIds());
            recommendations.addAll(eligible(songMapper.selectList(similarQuery.orderByDesc(Song::getPlayCount)
                    .last("LIMIT 100")), excluded, dislikes));
            recommendations.sort((a, b) -> Double.compare(score(b, singerWeights, categoryWeights),
                    score(a, singerWeights, categoryWeights)));
        }

        if (recommendations.size() > limit) {
            recommendations = new ArrayList<>(recommendations.subList(0, limit));
        }
        Set<Long> selectedIds = recommendations.stream().map(Song::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (recommendations.size() < limit) {
            for (Song trending : trending(excluded, dislikes, limit * 3)) {
                if (recommendations.size() >= limit) break;
                if (selectedIds.add(trending.getId())) recommendations.add(trending);
            }
        }

        List<SongVO> result = songAssembler.toVOList(recommendations);
        result.forEach(song -> {
            song.setLyric(null);
            song.setLyricTranslation(null);
            song.setLyricRomaji(null);
        });
        return result;
    }

    /** 根据当前歌曲的歌手与分类生成相似电台候选。登录用户的不喜欢歌曲/歌手不进入候选或热度补齐。 */
    public List<SongVO> similar(Long sourceSongId, Integer requestedLimit, Long userId) {
        if (sourceSongId == null) {
            throw new BusinessException("请先选择一首歌曲");
        }
        int limit = Math.max(1, Math.min(requestedLimit == null ? 12 : requestedLimit, 24));
        Song source = songMapper.selectById(sourceSongId);
        if (source == null || !Integer.valueOf(1).equals(source.getStatus())) {
            throw new BusinessException("歌曲不存在或已下架");
        }

        DislikeRules dislikes = dislikeRules(userId);
        Map<Long, Integer> singerWeights = source.getSingerId() == null || dislikes.matchesSinger(source.getSingerId())
                ? Map.of() : Map.of(source.getSingerId(), 1);
        Map<Long, Integer> categoryWeights = source.getCategoryId() == null
                ? Map.of() : Map.of(source.getCategoryId(), 1);
        Set<Long> excluded = new HashSet<>();
        excluded.add(sourceSongId);
        excluded.addAll(dislikes.songIds());
        List<Song> candidates = new ArrayList<>();

        if (!singerWeights.isEmpty() || !categoryWeights.isEmpty()) {
            LambdaQueryWrapper<Song> query = new LambdaQueryWrapper<Song>()
                    .eq(Song::getStatus, 1)
                    .ne(Song::getId, sourceSongId)
                    .and(w -> {
                        boolean hasCondition = false;
                        if (!categoryWeights.isEmpty()) {
                            w.in(Song::getCategoryId, categoryWeights.keySet());
                            hasCondition = true;
                        }
                        if (!singerWeights.isEmpty()) {
                            if (hasCondition) w.or();
                            w.in(Song::getSingerId, singerWeights.keySet());
                        }
                    });
            if (!dislikes.singerIds().isEmpty()) query.notIn(Song::getSingerId, dislikes.singerIds());
            if (!dislikes.songIds().isEmpty()) query.notIn(Song::getId, dislikes.songIds());
            candidates.addAll(eligible(songMapper.selectList(query.orderByDesc(Song::getPlayCount)
                    .orderByAsc(Song::getId).last("LIMIT 200")), excluded, dislikes));
            candidates.sort((a, b) -> Double.compare(score(b, singerWeights, categoryWeights),
                    score(a, singerWeights, categoryWeights)));
        }

        if (candidates.size() > limit) candidates = new ArrayList<>(candidates.subList(0, limit));
        Set<Long> selectedIds = candidates.stream().map(Song::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (candidates.size() < limit) {
            for (Song trending : trending(excluded, dislikes, limit * 3)) {
                if (candidates.size() >= limit) break;
                if (selectedIds.add(trending.getId())) candidates.add(trending);
            }
        }

        List<SongVO> result = songAssembler.toVOList(candidates);
        result.forEach(song -> {
            song.setLyric(null);
            song.setLyricTranslation(null);
            song.setLyricRomaji(null);
        });
        return result;
    }

    private DislikeRules dislikeRules(Long userId) {
        if (userId == null) {
            return DislikeRules.empty();
        }
        DislikeRules rules = dislikeService.rules(userId);
        return rules == null ? DislikeRules.empty() : rules;
    }

    private List<Song> trending(Set<Long> excludedSongIds, DislikeRules rules, int limit) {
        LambdaQueryWrapper<Song> query = new LambdaQueryWrapper<Song>().eq(Song::getStatus, 1);
        if (!excludedSongIds.isEmpty()) query.notIn(Song::getId, excludedSongIds);
        if (!rules.singerIds().isEmpty()) query.notIn(Song::getSingerId, rules.singerIds());
        return eligible(songMapper.selectList(query.orderByDesc(Song::getPlayCount)
                .orderByDesc(Song::getId).last("LIMIT " + Math.max(1, limit))), excludedSongIds, rules);
    }

    private List<Song> eligible(List<Song> songs, Set<Long> excludedSongIds, DislikeRules rules) {
        List<Song> result = new ArrayList<>();
        if (songs == null) {
            return result;
        }
        for (Song song : songs) {
            if (song == null || song.getId() == null) continue;
            if (excludedSongIds.contains(song.getId())) continue;
            if (rules.matches(song)) continue;
            result.add(song);
        }
        return result;
    }

    private double score(Song song, Map<Long, Integer> singerWeights, Map<Long, Integer> categoryWeights) {
        int singer = song.getSingerId() == null ? 0 : singerWeights.getOrDefault(song.getSingerId(), 0);
        int category = song.getCategoryId() == null ? 0 : categoryWeights.getOrDefault(song.getCategoryId(), 0);
        long playCount = song.getPlayCount() == null ? 0L : song.getPlayCount();
        return singer * 5.0 + category * 3.0 + Math.log1p(playCount) / 20.0;
    }
}

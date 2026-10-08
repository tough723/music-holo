package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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

/** 可解释的内容推荐基线：优先相似歌手/分类，热度榜用于补齐与冷启动 */
@Service
@RequiredArgsConstructor
public class RecommendationService {

    private final SongMapper songMapper;
    private final UserPlayHistoryMapper historyMapper;
    private final UserFavoriteMapper favoriteMapper;
    private final SongAssembler songAssembler;

    public List<SongVO> songs(Long userId, Integer requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit == null ? 8 : requestedLimit, 24));
        Map<Long, Integer> singerWeights = new HashMap<>();
        Map<Long, Integer> categoryWeights = new HashMap<>();
        Set<Long> excluded = new HashSet<>();

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
                    if (seed.getSingerId() != null) {
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
            recommendations.addAll(songMapper.selectList(similarQuery.orderByDesc(Song::getPlayCount)
                    .last("LIMIT 100")));
            recommendations.sort((a, b) -> Double.compare(score(b, singerWeights, categoryWeights),
                    score(a, singerWeights, categoryWeights)));
        }

        if (recommendations.size() > limit) {
            recommendations = new ArrayList<>(recommendations.subList(0, limit));
        }
        Set<Long> selectedIds = recommendations.stream().map(Song::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (recommendations.size() < limit) {
            for (Song trending : trending(excluded, limit * 3)) {
                if (recommendations.size() >= limit) break;
                if (selectedIds.add(trending.getId())) recommendations.add(trending);
            }
        }

        List<SongVO> result = songAssembler.toVOList(recommendations);
        result.forEach(song -> song.setLyric(null));
        return result;
    }

    private List<Song> trending(Set<Long> excluded, int limit) {
        LambdaQueryWrapper<Song> query = new LambdaQueryWrapper<Song>().eq(Song::getStatus, 1);
        if (!excluded.isEmpty()) query.notIn(Song::getId, excluded);
        return songMapper.selectList(query.orderByDesc(Song::getPlayCount)
                .orderByDesc(Song::getId).last("LIMIT " + Math.max(1, limit)));
    }

    private double score(Song song, Map<Long, Integer> singerWeights, Map<Long, Integer> categoryWeights) {
        int singer = singerWeights.getOrDefault(song.getSingerId(), 0);
        int category = categoryWeights.getOrDefault(song.getCategoryId(), 0);
        long playCount = song.getPlayCount() == null ? 0L : song.getPlayCount();
        return singer * 5.0 + category * 3.0 + Math.log1p(playCount) / 20.0;
    }
}

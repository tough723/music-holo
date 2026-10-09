package com.musicholo.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.PlaylistBackupDTO;
import com.musicholo.dto.PlaylistBackupImportRequestDTO;
import com.musicholo.dto.PlaylistBackupPlaylistDTO;
import com.musicholo.dto.PlaylistBackupSongDTO;
import com.musicholo.dto.PlaylistBackupTrackChoiceDTO;
import com.musicholo.dto.PlaylistSaveDTO;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.PlaylistSong;
import com.musicholo.entity.Song;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.PlaylistSongMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.vo.PlaylistBackupCandidateVO;
import com.musicholo.vo.PlaylistBackupImportResultVO;
import com.musicholo.vo.PlaylistBackupImportedPlaylistVO;
import com.musicholo.vo.PlaylistBackupPlaylistPreviewVO;
import com.musicholo.vo.PlaylistBackupPreviewVO;
import com.musicholo.vo.PlaylistBackupTrackPreviewVO;
import com.musicholo.vo.PlaylistVO;
import com.musicholo.vo.SongVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Per-account, versioned playlist backup. The backup schema is an explicit allow-list:
 * it never transports catalog audio URLs, lyrics, account data, or source scripts.
 */
@Service
@RequiredArgsConstructor
public class PlaylistBackupService {

    public static final int MAX_REQUEST_BYTES = 4 * 1024 * 1024;
    private static final int MAX_BACKUP_BYTES = 2 * 1024 * 1024;
    private static final int MAX_PLAYLISTS = 200;
    private static final int MAX_SONGS_PER_PLAYLIST = 2000;
    private static final int MAX_TOTAL_SONGS = 10000;
    private static final int MAX_QUERY_BATCH = 400;
    private static final int MAX_MATCH_CANDIDATES = 20;
    private static final int MAX_NAME_LENGTH = 100;

    private final PlaylistMapper playlistMapper;
    private final PlaylistSongMapper playlistSongMapper;
    private final SongMapper songMapper;
    private final SongAssembler songAssembler;
    private final PlaylistService playlistService;
    private final ObjectMapper objectMapper;

    /** Export only playlists owned by the authenticated account. */
    public PlaylistBackupDTO exportOwn(Long userId) {
        requireUserId(userId);
        List<Playlist> owned = playlistMapper.selectList(new LambdaQueryWrapper<Playlist>()
                .eq(Playlist::getCreatorId, userId)
                .orderByAsc(Playlist::getId));
        if (owned.size() > MAX_PLAYLISTS) {
            throw badRequest("单次最多导出 200 张歌单，请先减少歌单数量");
        }

        PlaylistBackupDTO backup = new PlaylistBackupDTO();
        backup.setFormat(PlaylistBackupDTO.FORMAT);
        backup.setVersion(PlaylistBackupDTO.VERSION);
        backup.setExportedAt(Instant.now().toString());

        List<Long> playlistIds = owned.stream().map(Playlist::getId).toList();
        List<PlaylistSong> links = playlistIds.isEmpty() ? List.of() : playlistSongMapper.selectList(
                new LambdaQueryWrapper<PlaylistSong>()
                        .in(PlaylistSong::getPlaylistId, playlistIds)
                        .orderByAsc(PlaylistSong::getPlaylistId)
                        .orderByAsc(PlaylistSong::getSort)
                        .orderByAsc(PlaylistSong::getId));
        Map<Long, Song> songsById = loadSongsByIds(links.stream().map(PlaylistSong::getSongId).toList());
        Map<Long, SongVO> songViews = toSongViews(songsById.values());
        Map<Long, List<PlaylistSong>> linksByPlaylist = links.stream()
                .collect(Collectors.groupingBy(PlaylistSong::getPlaylistId, LinkedHashMap::new, Collectors.toList()));

        List<PlaylistBackupPlaylistDTO> exported = new ArrayList<>();
        int totalSongs = 0;
        for (Playlist playlist : owned) {
            PlaylistBackupPlaylistDTO item = new PlaylistBackupPlaylistDTO();
            item.setName(playlist.getName());
            item.setDescription(playlist.getDescription() == null ? "" : playlist.getDescription());
            item.setSourcePublic(Integer.valueOf(1).equals(playlist.getIsPublic()));
            List<PlaylistBackupSongDTO> exportedSongs = new ArrayList<>();
            for (PlaylistSong link : linksByPlaylist.getOrDefault(playlist.getId(), List.of())) {
                SongVO song = songViews.get(link.getSongId());
                if (song == null || !Integer.valueOf(1).equals(song.getStatus())) {
                    continue;
                }
                PlaylistBackupSongDTO track = new PlaylistBackupSongDTO();
                track.setId(String.valueOf(song.getId()));
                track.setTitle(song.getTitle());
                track.setSingerName(song.getSingerName() == null ? "" : song.getSingerName());
                track.setAlbum(song.getAlbum() == null ? "" : song.getAlbum());
                track.setDuration(song.getDuration());
                exportedSongs.add(track);
            }
            if (exportedSongs.size() > MAX_SONGS_PER_PLAYLIST) {
                throw badRequest("歌单《" + playlist.getName() + "》超过单次备份的曲目上限");
            }
            totalSongs += exportedSongs.size();
            item.setSongs(exportedSongs);
            exported.add(item);
        }
        if (totalSongs > MAX_TOTAL_SONGS) {
            throw badRequest("单次最多备份 10000 首歌曲");
        }
        backup.setPlaylists(exported);
        validateBackup(backup);
        return backup;
    }

    /** Validate the backup and return a safe, non-mutating preview against the current public catalog. */
    public PlaylistBackupPreviewVO preview(PlaylistBackupDTO backup, Long userId) {
        requireUserId(userId);
        validateBackup(backup);
        return buildPreview(backup, userId);
    }

    /** Create new private copies by default. Existing playlists are never overwritten or merged. */
    @Transactional(rollbackFor = Exception.class)
    public PlaylistBackupImportResultVO importSelected(PlaylistBackupImportRequestDTO request, Long userId) {
        requireUserId(userId);
        if (request == null || request.getBackup() == null) {
            throw badRequest("请选择有效的歌单备份");
        }
        PlaylistBackupDTO backup = request.getBackup();
        validateBackup(backup);

        Set<Integer> selected = normalizeIndexes(request.getSelectedPlaylistIndexes(), backup.getPlaylists().size(), true);
        Set<Integer> makePublic = normalizeIndexes(request.getPublicPlaylistIndexes(), backup.getPlaylists().size(), false);
        if (!selected.containsAll(makePublic)) {
            throw badRequest("公开设置只能应用于已选中的歌单");
        }

        PlaylistBackupPreviewVO preview = buildPreview(backup, userId);
        Map<String, String> trackChoices = validateTrackChoices(
                request.getTrackChoices(), preview.getPlaylists(), selected);
        Set<String> usedNames = loadOwnedNames(userId);

        PlaylistBackupImportResultVO result = new PlaylistBackupImportResultVO();
        List<PlaylistBackupImportedPlaylistVO> imported = new ArrayList<>();
        int importedSongs = 0;
        int missingSongs = 0;
        int ambiguousSkipped = 0;

        for (int playlistIndex = 0; playlistIndex < backup.getPlaylists().size(); playlistIndex++) {
            if (!selected.contains(playlistIndex)) {
                continue;
            }
            PlaylistBackupPlaylistDTO source = backup.getPlaylists().get(playlistIndex);
            PlaylistBackupPlaylistPreviewVO match = preview.getPlaylists().get(playlistIndex);
            List<Long> songIds = new ArrayList<>();
            Set<Long> uniqueIds = new LinkedHashSet<>();
            int missing = 0;
            int skippedAmbiguous = 0;

            for (PlaylistBackupTrackPreviewVO track : match.getTracks()) {
                String songId = null;
                if ("matched".equals(track.getStatus())) {
                    songId = track.getResolvedSongId();
                } else if ("ambiguous".equals(track.getStatus())) {
                    songId = trackChoices.get(choiceKey(playlistIndex, track.getIndex()));
                    if (songId == null) {
                        skippedAmbiguous++;
                    }
                } else {
                    missing++;
                }
                if (songId != null) {
                    Long parsed = parsePositiveLong(songId);
                    if (parsed != null && uniqueIds.add(parsed)) {
                        songIds.add(parsed);
                    }
                }
            }

            String importedName = claimSuggestedName(match.getSuggestedName(), usedNames);
            PlaylistSaveDTO save = new PlaylistSaveDTO();
            save.setName(importedName);
            save.setDescription(source.getDescription() == null ? "" : source.getDescription());
            save.setIsPublic(makePublic.contains(playlistIndex) ? 1 : 0);
            PlaylistVO created = playlistService.save(save, userId);
            int added = songIds.isEmpty() ? 0 : playlistService.addSongs(created.getId(), songIds, userId);

            PlaylistBackupImportedPlaylistVO item = new PlaylistBackupImportedPlaylistVO();
            item.setPlaylistId(String.valueOf(created.getId()));
            item.setSourceName(source.getName());
            item.setImportedName(importedName);
            item.setAddedSongCount(added);
            item.setMissingSongCount(missing);
            item.setAmbiguousSkippedCount(skippedAmbiguous);
            item.setIsPublic(makePublic.contains(playlistIndex));
            imported.add(item);
            importedSongs += added;
            missingSongs += missing;
            ambiguousSkipped += skippedAmbiguous;
        }

        result.setImportedPlaylistCount(imported.size());
        result.setImportedSongCount(importedSongs);
        result.setMissingSongCount(missingSongs);
        result.setAmbiguousSkippedCount(ambiguousSkipped);
        result.setPlaylists(imported);
        return result;
    }

    private PlaylistBackupPreviewVO buildPreview(PlaylistBackupDTO backup, Long userId) {
        List<PlaylistBackupSongDTO> allTracks = backup.getPlaylists().stream()
                .flatMap(playlist -> playlist.getSongs().stream()).toList();
        Map<Long, Song> bySourceId = loadSongsByIds(allTracks.stream()
                .map(track -> parsePositiveLong(track.getId()))
                .filter(Objects::nonNull)
                .toList());
        Map<Long, SongVO> initialViews = toSongViews(bySourceId.values());

        Set<String> fallbackTitles = new LinkedHashSet<>();
        for (PlaylistBackupSongDTO track : allTracks) {
            Long sourceId = parsePositiveLong(track.getId());
            Song catalogSong = sourceId == null ? null : bySourceId.get(sourceId);
            SongVO catalogView = catalogSong == null ? null : initialViews.get(catalogSong.getId());
            if (catalogView == null || !sameTrackIdentity(track, catalogView)) {
                if (hasText(track.getTitle())) {
                    fallbackTitles.add(track.getTitle().trim());
                }
            }
        }
        Map<String, List<Song>> fallbackByTitle = loadSongsByTitles(fallbackTitles);
        Map<Long, Song> catalogSongs = new LinkedHashMap<>(bySourceId);
        fallbackByTitle.values().stream().flatMap(Collection::stream)
                .forEach(song -> catalogSongs.put(song.getId(), song));
        Map<Long, SongVO> views = toSongViews(catalogSongs.values());

        Set<String> usedNames = loadOwnedNames(userId);
        List<PlaylistBackupPlaylistPreviewVO> previews = new ArrayList<>();
        int total = 0;
        int matched = 0;
        int missing = 0;
        int ambiguous = 0;

        for (int playlistIndex = 0; playlistIndex < backup.getPlaylists().size(); playlistIndex++) {
            PlaylistBackupPlaylistDTO source = backup.getPlaylists().get(playlistIndex);
            PlaylistBackupPlaylistPreviewVO playlist = new PlaylistBackupPlaylistPreviewVO();
            playlist.setIndex(playlistIndex);
            playlist.setName(source.getName());
            playlist.setDescription(source.getDescription() == null ? "" : source.getDescription());
            playlist.setSourcePublic(source.getSourcePublic());
            String suggestedName = uniqueName(source.getName(), usedNames);
            playlist.setSuggestedName(suggestedName);
            playlist.setNameConflict(!normalize(suggestedName).equals(normalize(source.getName())));

            List<PlaylistBackupTrackPreviewVO> tracks = new ArrayList<>();
            int playlistMatched = 0;
            int playlistMissing = 0;
            int playlistAmbiguous = 0;
            for (int trackIndex = 0; trackIndex < source.getSongs().size(); trackIndex++) {
                PlaylistBackupSongDTO sourceTrack = source.getSongs().get(trackIndex);
                PlaylistBackupTrackPreviewVO track = resolveTrack(trackIndex, sourceTrack, bySourceId, fallbackByTitle, views);
                tracks.add(track);
                switch (track.getStatus()) {
                    case "matched" -> playlistMatched++;
                    case "ambiguous" -> playlistAmbiguous++;
                    default -> playlistMissing++;
                }
            }
            playlist.setTracks(tracks);
            playlist.setTotalSongCount(tracks.size());
            playlist.setMatchedSongCount(playlistMatched);
            playlist.setMissingSongCount(playlistMissing);
            playlist.setAmbiguousSongCount(playlistAmbiguous);
            previews.add(playlist);
            total += tracks.size();
            matched += playlistMatched;
            missing += playlistMissing;
            ambiguous += playlistAmbiguous;
        }

        PlaylistBackupPreviewVO result = new PlaylistBackupPreviewVO();
        result.setPlaylistCount(previews.size());
        result.setTotalSongCount(total);
        result.setMatchedSongCount(matched);
        result.setMissingSongCount(missing);
        result.setAmbiguousSongCount(ambiguous);
        result.setPlaylists(previews);
        return result;
    }

    private PlaylistBackupTrackPreviewVO resolveTrack(
            int index,
            PlaylistBackupSongDTO source,
            Map<Long, Song> bySourceId,
            Map<String, List<Song>> fallbackByTitle,
            Map<Long, SongVO> views) {
        PlaylistBackupTrackPreviewVO result = new PlaylistBackupTrackPreviewVO();
        result.setIndex(index);
        result.setTitle(source.getTitle());
        result.setSingerName(source.getSingerName() == null ? "" : source.getSingerName());
        result.setAlbum(source.getAlbum() == null ? "" : source.getAlbum());

        Long sourceId = parsePositiveLong(source.getId());
        Song direct = sourceId == null ? null : bySourceId.get(sourceId);
        SongVO directView = direct == null ? null : views.get(direct.getId());
        if (directView != null && sameTrackIdentity(source, directView)) {
            result.setStatus("matched");
            result.setResolvedSongId(String.valueOf(directView.getId()));
            result.setCandidates(List.of(toCandidate(directView)));
            return result;
        }

        List<SongVO> matches = fallbackByTitle.getOrDefault(normalize(source.getTitle()), List.of()).stream()
                .map(song -> views.get(song.getId()))
                .filter(Objects::nonNull)
                .filter(song -> sameTrackIdentity(source, song))
                .collect(Collectors.toMap(SongVO::getId, song -> song, (first, ignored) -> first, LinkedHashMap::new))
                .values().stream().toList();
        if (matches.isEmpty()) {
            result.setStatus("missing");
            result.setCandidates(List.of());
        } else if (matches.size() == 1) {
            result.setStatus("matched");
            result.setResolvedSongId(String.valueOf(matches.get(0).getId()));
            result.setCandidates(List.of(toCandidate(matches.get(0))));
        } else {
            result.setStatus("ambiguous");
            result.setCandidates(matches.stream().limit(MAX_MATCH_CANDIDATES).map(this::toCandidate).toList());
        }
        return result;
    }

    private Map<Long, Song> loadSongsByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return new LinkedHashMap<>();
        }
        List<Long> unique = ids.stream().filter(Objects::nonNull).distinct().toList();
        Map<Long, Song> result = new LinkedHashMap<>();
        for (int start = 0; start < unique.size(); start += MAX_QUERY_BATCH) {
            List<Long> batch = unique.subList(start, Math.min(start + MAX_QUERY_BATCH, unique.size()));
            songMapper.selectBatchIds(batch).stream()
                    .filter(song -> Integer.valueOf(1).equals(song.getStatus()))
                    .forEach(song -> result.put(song.getId(), song));
        }
        return result;
    }

    private Map<String, List<Song>> loadSongsByTitles(Collection<String> titles) {
        if (titles == null || titles.isEmpty()) {
            return Map.of();
        }
        List<String> unique = titles.stream().filter(PlaylistBackupService::hasText)
                .map(String::trim).distinct().toList();
        Map<String, List<Song>> result = new HashMap<>();
        for (int start = 0; start < unique.size(); start += MAX_QUERY_BATCH) {
            List<String> batch = unique.subList(start, Math.min(start + MAX_QUERY_BATCH, unique.size()));
            songMapper.selectList(new LambdaQueryWrapper<Song>()
                            .in(Song::getTitle, batch)
                            .eq(Song::getStatus, 1))
                    .forEach(song -> result.computeIfAbsent(normalize(song.getTitle()), ignored -> new ArrayList<>()).add(song));
        }
        return result;
    }

    private Map<Long, SongVO> toSongViews(Collection<Song> songs) {
        if (songs == null || songs.isEmpty()) {
            return Map.of();
        }
        return songAssembler.toVOList(new ArrayList<>(songs)).stream()
                .collect(Collectors.toMap(SongVO::getId, song -> song, (first, ignored) -> first, LinkedHashMap::new));
    }

    private boolean sameTrackIdentity(PlaylistBackupSongDTO source, SongVO catalog) {
        if (catalog == null || !normalize(source.getTitle()).equals(normalize(catalog.getTitle()))) {
            return false;
        }
        if (hasText(source.getSingerName()) && !normalize(source.getSingerName()).equals(normalize(catalog.getSingerName()))) {
            return false;
        }
        return !hasText(source.getAlbum()) || normalize(source.getAlbum()).equals(normalize(catalog.getAlbum()));
    }

    private PlaylistBackupCandidateVO toCandidate(SongVO song) {
        PlaylistBackupCandidateVO candidate = new PlaylistBackupCandidateVO();
        candidate.setId(String.valueOf(song.getId()));
        candidate.setTitle(song.getTitle());
        candidate.setSingerName(song.getSingerName() == null ? "" : song.getSingerName());
        candidate.setAlbum(song.getAlbum() == null ? "" : song.getAlbum());
        return candidate;
    }

    private Set<String> loadOwnedNames(Long userId) {
        return playlistMapper.selectList(new LambdaQueryWrapper<Playlist>()
                        .eq(Playlist::getCreatorId, userId)
                        .select(Playlist::getName))
                .stream().map(Playlist::getName)
                .filter(PlaylistBackupService::hasText)
                .map(PlaylistBackupService::normalize)
                .collect(Collectors.toCollection(HashSet::new));
    }

    private String uniqueName(String requestedName, Set<String> usedNames) {
        String base = requestedName == null ? "导入歌单" : requestedName.trim();
        if (base.isEmpty()) {
            base = "导入歌单";
        }
        base = truncate(base, MAX_NAME_LENGTH);
        if (usedNames.add(normalize(base))) {
            return base;
        }
        for (int suffixIndex = 2; suffixIndex < 10000; suffixIndex++) {
            String suffix = "（导入 " + suffixIndex + "）";
            String candidate = truncate(base, MAX_NAME_LENGTH - suffix.length()) + suffix;
            if (usedNames.add(normalize(candidate))) {
                return candidate;
            }
        }
        throw badRequest("无法为同名歌单生成唯一名称");
    }

    /** Preserve the name presented in preview; only add another suffix if it became occupied meanwhile. */
    private String claimSuggestedName(String suggestedName, Set<String> usedNames) {
        String candidate = truncate(hasText(suggestedName) ? suggestedName.trim() : "导入歌单", MAX_NAME_LENGTH);
        if (usedNames.add(normalize(candidate))) {
            return candidate;
        }
        return uniqueName(candidate, usedNames);
    }

    private Map<String, String> validateTrackChoices(
            List<PlaylistBackupTrackChoiceDTO> choices,
            List<PlaylistBackupPlaylistPreviewVO> previews,
            Set<Integer> selectedIndexes) {
        Map<String, String> result = new HashMap<>();
        if (choices == null) {
            return result;
        }
        if (choices.size() > MAX_TOTAL_SONGS) {
            throw badRequest("人工匹配曲目数量超出上限");
        }
        for (PlaylistBackupTrackChoiceDTO choice : choices) {
            if (choice == null || choice.getPlaylistIndex() == null || choice.getTrackIndex() == null || !hasText(choice.getSongId())) {
                throw badRequest("曲目匹配选择无效");
            }
            int playlistIndex = choice.getPlaylistIndex();
            int trackIndex = choice.getTrackIndex();
            if (!selectedIndexes.contains(playlistIndex) || playlistIndex < 0 || playlistIndex >= previews.size()) {
                throw badRequest("曲目匹配指向了未选中的歌单");
            }
            List<PlaylistBackupTrackPreviewVO> tracks = previews.get(playlistIndex).getTracks();
            if (trackIndex < 0 || trackIndex >= tracks.size()) {
                throw badRequest("曲目匹配位置无效");
            }
            PlaylistBackupTrackPreviewVO track = tracks.get(trackIndex);
            if (!"ambiguous".equals(track.getStatus()) || track.getCandidates().stream()
                    .noneMatch(candidate -> candidate.getId().equals(choice.getSongId()))) {
                throw badRequest("所选歌曲不属于此曲目的候选项");
            }
            String key = choiceKey(playlistIndex, trackIndex);
            if (result.putIfAbsent(key, choice.getSongId()) != null) {
                throw badRequest("同一曲目不能选择多个匹配项");
            }
        }
        return result;
    }

    private Set<Integer> normalizeIndexes(List<Integer> indexes, int upperBound, boolean required) {
        if (indexes == null || (required && indexes.isEmpty())) {
            throw badRequest(required ? "至少选择一张歌单" : "公开歌单选择无效");
        }
        if (indexes.size() > MAX_PLAYLISTS) {
            throw badRequest("选择的歌单数量超出上限");
        }
        Set<Integer> result = new LinkedHashSet<>();
        for (Integer index : indexes) {
            if (index == null || index < 0 || index >= upperBound || !result.add(index)) {
                throw badRequest("歌单选择列表包含重复或无效项");
            }
        }
        return result;
    }

    private void validateBackup(PlaylistBackupDTO backup) {
        if (backup == null || !PlaylistBackupDTO.FORMAT.equals(backup.getFormat())) {
            throw badRequest("文件不是 Music Holo 歌单备份");
        }
        if (!Integer.valueOf(PlaylistBackupDTO.VERSION).equals(backup.getVersion())) {
            throw badRequest("暂不支持此歌单备份版本");
        }
        if (!hasText(backup.getExportedAt()) || backup.getExportedAt().length() > 40) {
            throw badRequest("备份时间字段无效");
        }
        if (backup.getPlaylists() == null || backup.getPlaylists().size() > MAX_PLAYLISTS) {
            throw badRequest("备份歌单数量无效，最多支持 200 张");
        }
        int totalSongs = 0;
        for (PlaylistBackupPlaylistDTO playlist : backup.getPlaylists()) {
            if (playlist == null || !hasText(playlist.getName()) || playlist.getName().trim().length() > MAX_NAME_LENGTH) {
                throw badRequest("歌单名称无效或超过 100 个字符");
            }
            if (playlist.getDescription() != null && playlist.getDescription().length() > 500) {
                throw badRequest("歌单描述不能超过 500 个字符");
            }
            if (playlist.getSongs() == null || playlist.getSongs().size() > MAX_SONGS_PER_PLAYLIST) {
                throw badRequest("单张歌单最多支持 2000 首歌曲");
            }
            totalSongs += playlist.getSongs().size();
            if (totalSongs > MAX_TOTAL_SONGS) {
                throw badRequest("单次最多支持 10000 首歌曲");
            }
            for (PlaylistBackupSongDTO track : playlist.getSongs()) {
                if (track == null || !hasText(track.getTitle()) || track.getTitle().trim().length() > 200) {
                    throw badRequest("备份中存在无效的歌曲名称");
                }
                if (track.getSingerName() != null && track.getSingerName().length() > 120) {
                    throw badRequest("歌手名称字段超过长度上限");
                }
                if (track.getAlbum() != null && track.getAlbum().length() > 200) {
                    throw badRequest("专辑名称字段超过长度上限");
                }
                if (track.getDuration() != null && (track.getDuration() < 0 || track.getDuration() > 86400)) {
                    throw badRequest("歌曲时长字段无效");
                }
                if (hasText(track.getId()) && parsePositiveLong(track.getId()) == null) {
                    throw badRequest("歌曲 ID 字段无效");
                }
            }
        }
        try {
            if (objectMapper.writeValueAsBytes(backup).length > MAX_BACKUP_BYTES) {
                throw badRequest("歌单备份文件不能超过 2 MB");
            }
        } catch (JsonProcessingException e) {
            throw badRequest("无法解析歌单备份文件");
        }
    }

    private static String choiceKey(int playlistIndex, int trackIndex) {
        return playlistIndex + ":" + trackIndex;
    }

    private static Long parsePositiveLong(String value) {
        if (!hasText(value) || !value.matches("[1-9][0-9]{0,19}")) {
            return null;
        }
        try {
            long parsed = Long.parseLong(value);
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private static String truncate(String value, int maxLength) {
        if (maxLength <= 0) {
            return "";
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(401, "请先登录后再备份或导入歌单");
        }
    }

    private static BusinessException badRequest(String message) {
        return new BusinessException(400, message);
    }
}

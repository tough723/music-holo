package com.musicholo.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.musicholo.common.exception.BusinessException;
import com.musicholo.dto.MusicReviewCreateDTO;
import com.musicholo.dto.MusicReviewPageQuery;
import com.musicholo.dto.MusicReviewReportActionDTO;
import com.musicholo.dto.MusicReviewReportDTO;
import com.musicholo.dto.MusicReviewVisibilityDTO;
import com.musicholo.entity.MusicReview;
import com.musicholo.entity.MusicReviewLike;
import com.musicholo.entity.MusicReviewReport;
import com.musicholo.entity.Playlist;
import com.musicholo.entity.Song;
import com.musicholo.entity.SysUser;
import com.musicholo.mapper.MusicReviewLikeMapper;
import com.musicholo.mapper.MusicReviewMapper;
import com.musicholo.mapper.MusicReviewReportMapper;
import com.musicholo.mapper.PlaylistMapper;
import com.musicholo.mapper.SongMapper;
import com.musicholo.mapper.SysUserMapper;
import com.musicholo.vo.MusicReviewLikeVO;
import com.musicholo.vo.MusicReviewReportVO;
import com.musicholo.vo.MusicReviewVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 短评服务。公开评论即时展示，但登录发言、限长限频，并提供举报与管理员隐藏闭环。
 */
@Service
@RequiredArgsConstructor
public class MusicReviewService {

    public static final String TARGET_SONG = "song";
    public static final String TARGET_PLAYLIST = "playlist";
    private static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_REVIEWS_PER_MINUTE = 3;

    private final MusicReviewMapper reviewMapper;
    private final MusicReviewLikeMapper likeMapper;
    private final MusicReviewReportMapper reportMapper;
    private final SongMapper songMapper;
    private final PlaylistMapper playlistMapper;
    private final SysUserMapper sysUserMapper;
    private final UserService userService;

    /** 公开分页：只返回公开短评，作者可额外看到自己的隐藏短评。 */
    public Page<MusicReviewVO> page(MusicReviewPageQuery query, Long viewerId) {
        requireTarget(query);
        assertTargetVisible(query.getTargetType(), query.getTargetId(), viewerId);

        LambdaQueryWrapper<MusicReview> wrapper = new LambdaQueryWrapper<MusicReview>()
                .eq(MusicReview::getTargetType, query.getTargetType())
                .eq(MusicReview::getTargetId, query.getTargetId())
                .and(w -> {
                    w.eq(MusicReview::getStatus, MusicReview.STATUS_VISIBLE);
                    if (viewerId != null) {
                        w.or(own -> own.eq(MusicReview::getUserId, viewerId)
                                .eq(MusicReview::getStatus, MusicReview.STATUS_HIDDEN));
                    }
                })
                .orderByDesc(MusicReview::getCreateTime)
                .orderByDesc(MusicReview::getId);
        Page<MusicReview> page = reviewMapper.selectPage(new Page<>(safePage(query.getPageNum()), safeSize(query.getPageSize())), wrapper);
        return toReviewPage(page, viewerId, false);
    }

    /** 发布后立即公开；每位用户每分钟最多发布 3 条。 */
    public MusicReviewVO create(MusicReviewCreateDTO dto, Long userId) {
        assertTargetVisible(dto.getTargetType(), dto.getTargetId(), userId);
        LocalDateTime since = LocalDateTime.now().minusMinutes(1);
        Long recentCount = reviewMapper.selectCount(new LambdaQueryWrapper<MusicReview>()
                .eq(MusicReview::getUserId, userId)
                .ge(MusicReview::getCreateTime, since)
                .ne(MusicReview::getStatus, MusicReview.STATUS_DELETED));
        if (recentCount != null && recentCount >= MAX_REVIEWS_PER_MINUTE) {
            throw new BusinessException(429, "发布太频繁，请稍后再试（每分钟最多 3 条）");
        }

        MusicReview review = new MusicReview();
        review.setTargetType(dto.getTargetType());
        review.setTargetId(dto.getTargetId());
        review.setUserId(userId);
        review.setContent(dto.getContent().trim());
        review.setLikeCount(0);
        review.setStatus(MusicReview.STATUS_VISIBLE);
        reviewMapper.insert(review);
        return toReviewVO(review, userId, false, Map.of(), Set.of(), Map.of());
    }

    /** 作者只能删除自己的短评；保留记录供举报审计，不再对公众显示。 */
    public void delete(Long reviewId, Long userId) {
        MusicReview review = getReview(reviewId);
        if (!review.getUserId().equals(userId)) {
            throw new BusinessException(403, "只能删除自己发布的短评");
        }
        if (review.getStatus() == MusicReview.STATUS_DELETED) return;
        review.setStatus(MusicReview.STATUS_DELETED);
        review.setModerationNote(null);
        reviewMapper.updateById(review);
    }

    /** 期望状态式点赞，重复提交不会重复增加计数。 */
    @Transactional(rollbackFor = Exception.class)
    public MusicReviewLikeVO setLiked(Long reviewId, Long userId, boolean liked) {
        MusicReview review = getVisibleReview(reviewId);
        assertTargetVisible(review.getTargetType(), review.getTargetId(), userId);
        if (liked) {
            int inserted = likeMapper.insertIgnore(IdWorker.getId(), reviewId, userId);
            if (inserted > 0) {
                reviewMapper.update(null, new LambdaUpdateWrapper<MusicReview>()
                        .eq(MusicReview::getId, reviewId)
                        .setSql("like_count = like_count + 1"));
            }
        } else {
            int removed = likeMapper.delete(new LambdaQueryWrapper<MusicReviewLike>()
                    .eq(MusicReviewLike::getReviewId, reviewId)
                    .eq(MusicReviewLike::getUserId, userId));
            if (removed > 0) {
                reviewMapper.update(null, new LambdaUpdateWrapper<MusicReview>()
                        .eq(MusicReview::getId, reviewId)
                        .setSql("like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END"));
            }
        }
        MusicReview latest = getReview(reviewId);
        return new MusicReviewLikeVO(liked, latest.getLikeCount());
    }

    /** 一个用户对同一条短评只能举报一次。 */
    public void report(Long reviewId, Long reporterId, MusicReviewReportDTO dto) {
        MusicReview review = getVisibleReview(reviewId);
        if (review.getUserId().equals(reporterId)) {
            throw new BusinessException(400, "不能举报自己发布的短评");
        }
        assertTargetVisible(review.getTargetType(), review.getTargetId(), reporterId);
        Long existing = reportMapper.selectCount(new LambdaQueryWrapper<MusicReviewReport>()
                .eq(MusicReviewReport::getReviewId, reviewId)
                .eq(MusicReviewReport::getReporterId, reporterId));
        if (existing != null && existing > 0) {
            throw new BusinessException(409, "你已举报过这条短评，管理员会尽快处理");
        }
        MusicReviewReport report = new MusicReviewReport();
        report.setReviewId(reviewId);
        report.setReporterId(reporterId);
        report.setReason(dto.getReason());
        report.setDetails(StrUtil.trimToNull(dto.getDetails()));
        report.setStatus(MusicReviewReport.STATUS_OPEN);
        reportMapper.insert(report);
    }

    /** 管理员查询短评，可选按对象、对象 ID 和状态筛选。 */
    public Page<MusicReviewVO> adminPage(MusicReviewPageQuery query, Long adminId) {
        LambdaQueryWrapper<MusicReview> wrapper = new LambdaQueryWrapper<MusicReview>()
                .eq(StrUtil.isNotBlank(query.getTargetType()), MusicReview::getTargetType, query.getTargetType())
                .eq(query.getTargetId() != null, MusicReview::getTargetId, query.getTargetId())
                .eq(query.getStatus() != null, MusicReview::getStatus, query.getStatus())
                .ne(query.getStatus() == null, MusicReview::getStatus, MusicReview.STATUS_DELETED)
                .orderByDesc(MusicReview::getCreateTime)
                .orderByDesc(MusicReview::getId);
        Page<MusicReview> page = reviewMapper.selectPage(new Page<>(safePage(query.getPageNum()), safeSize(query.getPageSize())), wrapper);
        return toReviewPage(page, adminId, true);
    }

    /** 管理端举报队列；默认只看待处理项。 */
    public Page<MusicReviewReportVO> reportPage(MusicReviewPageQuery query) {
        int status = query.getStatus() == null ? MusicReviewReport.STATUS_OPEN : query.getStatus();
        if (status < MusicReviewReport.STATUS_OPEN || status > MusicReviewReport.STATUS_DISMISSED) {
            throw new BusinessException(400, "举报状态无效");
        }
        Page<MusicReviewReport> page = reportMapper.selectPage(
                new Page<>(safePage(query.getPageNum()), safeSize(query.getPageSize())),
                new LambdaQueryWrapper<MusicReviewReport>()
                        .eq(MusicReviewReport::getStatus, status)
                        .orderByDesc(MusicReviewReport::getCreateTime)
                        .orderByDesc(MusicReviewReport::getId));
        return toReportPage(page);
    }

    /** 独立管理端操作：隐藏或恢复短评；作者删除的内容不可恢复。 */
    @Transactional(rollbackFor = Exception.class)
    public void setVisibility(Long reviewId, MusicReviewVisibilityDTO dto, Long adminId) {
        MusicReview review = getReview(reviewId);
        if (review.getStatus() == MusicReview.STATUS_DELETED) {
            throw new BusinessException(409, "作者已删除该短评，不能恢复");
        }
        boolean hidden = Boolean.TRUE.equals(dto.getHidden());
        String note = StrUtil.trimToNull(dto.getNote());
        review.setStatus(hidden ? MusicReview.STATUS_HIDDEN : MusicReview.STATUS_VISIBLE);
        review.setModerationNote(hidden ? (note == null ? "经管理员审核，暂时隐藏" : note) : null);
        reviewMapper.updateById(review);
        if (hidden) {
            reportMapper.update(null, new LambdaUpdateWrapper<MusicReviewReport>()
                    .eq(MusicReviewReport::getReviewId, reviewId)
                    .eq(MusicReviewReport::getStatus, MusicReviewReport.STATUS_OPEN)
                    .set(MusicReviewReport::getStatus, MusicReviewReport.STATUS_RESOLVED)
                    .set(MusicReviewReport::getAction, "hide")
                    .set(MusicReviewReport::getHandledBy, adminId)
                    .set(MusicReviewReport::getHandledAt, LocalDateTime.now())
                    .set(MusicReviewReport::getAdminNote, note));
        }
    }

    /** 举报处理：隐藏并处理该条的所有待处理举报，或驳回当前举报。 */
    @Transactional(rollbackFor = Exception.class)
    public void handleReport(Long reportId, Long adminId, MusicReviewReportActionDTO dto) {
        MusicReviewReport report = reportMapper.selectById(reportId);
        if (report == null) throw new BusinessException(404, "举报记录不存在");
        if (report.getStatus() != MusicReviewReport.STATUS_OPEN) {
            throw new BusinessException(409, "该举报已处理");
        }
        String note = StrUtil.trimToNull(dto.getNote());
        if ("hide".equals(dto.getAction())) {
            MusicReview review = getReview(report.getReviewId());
            if (review.getStatus() != MusicReview.STATUS_DELETED) {
                review.setStatus(MusicReview.STATUS_HIDDEN);
                review.setModerationNote(note == null ? "经举报审核，短评已隐藏" : note);
                reviewMapper.updateById(review);
            }
            reportMapper.update(null, new LambdaUpdateWrapper<MusicReviewReport>()
                    .eq(MusicReviewReport::getReviewId, report.getReviewId())
                    .eq(MusicReviewReport::getStatus, MusicReviewReport.STATUS_OPEN)
                    .set(MusicReviewReport::getStatus, MusicReviewReport.STATUS_RESOLVED)
                    .set(MusicReviewReport::getAction, "hide")
                    .set(MusicReviewReport::getHandledBy, adminId)
                    .set(MusicReviewReport::getHandledAt, LocalDateTime.now())
                    .set(MusicReviewReport::getAdminNote, note));
            return;
        }
        report.setStatus(MusicReviewReport.STATUS_DISMISSED);
        report.setAction("dismiss");
        report.setHandledBy(adminId);
        report.setHandledAt(LocalDateTime.now());
        report.setAdminNote(note);
        reportMapper.updateById(report);
    }

    private Page<MusicReviewVO> toReviewPage(Page<MusicReview> page, Long viewerId, boolean admin) {
        List<MusicReview> rows = page.getRecords();
        List<Long> userIds = rows.stream().map(MusicReview::getUserId).distinct().toList();
        Map<Long, SysUser> users = userIds.isEmpty() ? Map.of() : sysUserMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(SysUser::getId, user -> user));
        Map<String, Map<Long, String>> titles = loadTargetTitles(rows);
        Set<Long> likedIds = new HashSet<>();
        List<Long> reviewIds = rows.stream().map(MusicReview::getId).toList();
        if (viewerId != null && !reviewIds.isEmpty()) {
            likedIds = likeMapper.selectList(new LambdaQueryWrapper<MusicReviewLike>()
                    .eq(MusicReviewLike::getUserId, viewerId)
                    .in(MusicReviewLike::getReviewId, reviewIds))
                    .stream().map(MusicReviewLike::getReviewId).collect(Collectors.toSet());
        }
        Set<Long> finalLikedIds = likedIds;
        List<MusicReviewVO> records = rows.stream()
                .map(row -> toReviewVO(row, viewerId, admin, users, finalLikedIds, titles))
                .toList();
        Page<MusicReviewVO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(records);
        return result;
    }

    private MusicReviewVO toReviewVO(MusicReview review,
                                    Long viewerId,
                                    boolean admin,
                                    Map<Long, SysUser> users,
                                    Set<Long> likedIds,
                                    Map<String, Map<Long, String>> titles) {
        MusicReviewVO vo = new MusicReviewVO();
        vo.setId(review.getId());
        vo.setTargetType(review.getTargetType());
        vo.setTargetId(review.getTargetId());
        Map<Long, String> titlesForType = titles.get(review.getTargetType());
        String title = titlesForType == null ? null : titlesForType.get(review.getTargetId());
        vo.setTargetTitle(title == null ? targetTitle(review.getTargetType(), review.getTargetId()) : title);
        SysUser author = users.get(review.getUserId());
        if (author == null && review.getUserId() != null) author = sysUserMapper.selectById(review.getUserId());
        vo.setAuthorId(review.getUserId());
        vo.setAuthorName(displayName(author));
        vo.setAuthorAvatar(author == null ? null : author.getAvatar());
        vo.setContent(review.getContent());
        vo.setLikeCount(review.getLikeCount() == null ? 0 : review.getLikeCount());
        vo.setStatus(review.getStatus());
        vo.setMine(viewerId != null && viewerId.equals(review.getUserId()));
        vo.setLiked(viewerId != null && likedIds.contains(review.getId()));
        if (admin || Boolean.TRUE.equals(vo.getMine())) vo.setModerationNote(review.getModerationNote());
        vo.setCreateTime(review.getCreateTime());
        return vo;
    }

    private Page<MusicReviewReportVO> toReportPage(Page<MusicReviewReport> page) {
        List<MusicReviewReport> rows = page.getRecords();
        Set<Long> reviewIds = rows.stream().map(MusicReviewReport::getReviewId).collect(Collectors.toSet());
        Set<Long> usersIds = rows.stream().map(MusicReviewReport::getReporterId).collect(Collectors.toSet());
        List<MusicReview> reviews = reviewIds.isEmpty() ? List.of() : reviewMapper.selectBatchIds(reviewIds);
        Map<Long, MusicReview> reviewMap = reviews.stream().collect(Collectors.toMap(MusicReview::getId, row -> row));
        for (MusicReviewReport report : rows) {
            MusicReview review = reviewMap.get(report.getReviewId());
            if (review != null) usersIds.add(review.getUserId());
            if (report.getHandledBy() != null) usersIds.add(report.getHandledBy());
        }
        Map<Long, SysUser> users = usersIds.isEmpty() ? Map.of() : sysUserMapper.selectBatchIds(usersIds).stream()
                .collect(Collectors.toMap(SysUser::getId, user -> user));
        Map<String, Map<Long, String>> titles = loadTargetTitles(reviews);
        List<MusicReviewReportVO> records = new ArrayList<>();
        for (MusicReviewReport report : rows) {
            MusicReview review = reviewMap.get(report.getReviewId());
            MusicReviewReportVO vo = new MusicReviewReportVO();
            vo.setId(report.getId());
            vo.setReviewId(report.getReviewId());
            if (review != null) {
                vo.setTargetType(review.getTargetType());
                vo.setTargetId(review.getTargetId());
                vo.setTargetTitle(titles.getOrDefault(review.getTargetType(), Map.of())
                        .getOrDefault(review.getTargetId(), "对象已删除"));
                vo.setReviewContent(review.getContent());
                vo.setReviewStatus(review.getStatus());
                vo.setAuthorName(displayName(users.get(review.getUserId())));
            } else {
                vo.setTargetTitle("短评已删除");
                vo.setReviewContent("短评记录不可用");
            }
            vo.setReporterName(displayName(users.get(report.getReporterId())));
            vo.setReason(report.getReason());
            vo.setDetails(report.getDetails());
            vo.setStatus(report.getStatus());
            vo.setAction(report.getAction());
            vo.setAdminNote(report.getAdminNote());
            vo.setHandlerName(displayName(users.get(report.getHandledBy())));
            vo.setCreateTime(report.getCreateTime());
            vo.setHandledAt(report.getHandledAt());
            records.add(vo);
        }
        Page<MusicReviewReportVO> result = new Page<>(page.getCurrent(), page.getSize(), page.getTotal());
        result.setRecords(records);
        return result;
    }

    private Map<String, Map<Long, String>> loadTargetTitles(Collection<MusicReview> reviews) {
        Map<String, Set<Long>> idsByType = new HashMap<>();
        for (MusicReview review : reviews) {
            idsByType.computeIfAbsent(review.getTargetType(), ignored -> new HashSet<>()).add(review.getTargetId());
        }
        Map<String, Map<Long, String>> result = new HashMap<>();
        Set<Long> songIds = idsByType.getOrDefault(TARGET_SONG, Set.of());
        if (!songIds.isEmpty()) {
            Map<Long, String> songs = songMapper.selectBatchIds(songIds).stream()
                    .collect(Collectors.toMap(Song::getId, Song::getTitle));
            result.put(TARGET_SONG, songs);
        }
        Set<Long> playlistIds = idsByType.getOrDefault(TARGET_PLAYLIST, Set.of());
        if (!playlistIds.isEmpty()) {
            Map<Long, String> playlists = playlistMapper.selectBatchIds(playlistIds).stream()
                    .collect(Collectors.toMap(Playlist::getId, Playlist::getName));
            result.put(TARGET_PLAYLIST, playlists);
        }
        return result;
    }

    private void assertTargetVisible(String type, Long id, Long viewerId) {
        if (TARGET_SONG.equals(type)) {
            Song song = songMapper.selectById(id);
            boolean admin = viewerId != null && userService.isAdmin(viewerId);
            if (song == null || (!admin && !Integer.valueOf(1).equals(song.getStatus()))) {
                throw new BusinessException(404, "歌曲不存在");
            }
            return;
        }
        if (TARGET_PLAYLIST.equals(type)) {
            Playlist playlist = playlistMapper.selectById(id);
            if (playlist == null) throw new BusinessException(404, "歌单不存在");
            boolean owner = viewerId != null && viewerId.equals(playlist.getCreatorId());
            boolean admin = viewerId != null && userService.isAdmin(viewerId);
            if (!Integer.valueOf(1).equals(playlist.getIsPublic()) && !owner && !admin) {
                throw new BusinessException(404, "歌单不存在");
            }
            return;
        }
        throw new BusinessException(400, "短评对象类型无效");
    }

    private MusicReview getReview(Long id) {
        MusicReview review = reviewMapper.selectById(id);
        if (review == null) throw new BusinessException(404, "短评不存在");
        return review;
    }

    private MusicReview getVisibleReview(Long id) {
        MusicReview review = getReview(id);
        if (review.getStatus() != MusicReview.STATUS_VISIBLE) {
            throw new BusinessException(404, "短评不存在或已隐藏");
        }
        return review;
    }

    private String targetTitle(String type, Long id) {
        if (TARGET_SONG.equals(type)) {
            Song song = songMapper.selectById(id);
            return song == null ? "歌曲" : song.getTitle();
        }
        Playlist playlist = playlistMapper.selectById(id);
        return playlist == null ? "歌单" : playlist.getName();
    }

    private String displayName(SysUser user) {
        if (user == null || StrUtil.isBlank(user.getNickname())) return "音乐听众";
        return user.getNickname();
    }

    private void requireTarget(MusicReviewPageQuery query) {
        if (StrUtil.isBlank(query.getTargetType()) || query.getTargetId() == null || query.getTargetId() <= 0) {
            throw new BusinessException(400, "请指定有效的短评对象");
        }
    }

    private long safePage(long pageNum) {
        return Math.max(1, pageNum);
    }

    private long safeSize(long pageSize) {
        return Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
    }
}

package com.musicholo.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
public class MusicReviewReportVO implements Serializable {

    private Long id;
    private Long reviewId;
    private String targetType;
    private Long targetId;
    private String targetTitle;
    private String reviewContent;
    private Integer reviewStatus;
    private String authorName;
    private String reporterName;
    private String reason;
    private String details;
    private Integer status;
    private String action;
    private String adminNote;
    private String handlerName;
    private LocalDateTime createTime;
    private LocalDateTime handledAt;
}

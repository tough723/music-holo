<template>
  <div v-if="resumePrompt" class="session-resume" role="status">
    <div class="session-resume-text">
      继续上次的收听？队列 {{ resumePrompt.count }} 首，上次播到第 {{ resumePrompt.index }} 首 · {{ resumePrompt.position }}
    </div>
    <div class="session-resume-actions">
      <button type="button" class="session-resume-btn primary" @click="resumeSession">继续</button>
      <button type="button" class="session-resume-btn" @click="ignoreSession">忽略</button>
    </div>
  </div>
  <div
    class="player-bar glass-panel"
    :class="{
      'is-compact': isCompactView,
      'is-mini': viewMode === 'mini',
      'is-immersive': viewMode === 'immersive',
      'is-stage': viewMode === 'stage',
      'dock-left': docked && dock === 'left',
      'dock-right': docked && dock === 'right',
      'is-faded': barFaded
    }"
    @pointerenter="cancelBarFade"
    @pointerleave="scheduleBarFade"
    @focusin="cancelBarFade"
  >
    <!-- 迷你/沉浸形态：拖拽把手（拖到屏幕边缘即换停靠位置） -->
    <button
      v-if="isCompactView"
      type="button"
      class="pb-grip"
      aria-label="拖动播放条到屏幕边缘可切换停靠位置"
      @pointerdown="onGripPointerDown"
      @pointermove="onGripPointerMove"
      @pointerup="onGripPointerUp"
      @pointercancel="onGripPointerUp"
    >
      <span></span><span></span><span></span>
    </button>

    <!-- 左侧：全息投影 + 歌曲信息 -->
    <div class="pb-left">
      <div class="pb-holo" @click="toggleLyric">
        <HoloProjector
          :cover="currentSong?.cover"
          :anonymous-cover="Boolean(currentSong?.isCustomSource)"
          :title="currentSong?.title"
          :playing="playing"
          :size="58"
        />
      </div>
      <div class="pb-info">
        <div class="pb-title" :title="currentSong?.title || '暂无播放'">
          {{ currentSong?.title || '暂无播放' }}
        </div>
        <div class="pb-artist">{{ currentSong?.singerName || 'Music Holo' }}</div>
      </div>
      <el-tooltip v-if="currentSong && !currentSong.isLocal && !currentSong.isCustomSource" :content="isFav ? '取消收藏' : '收藏'" placement="top">
        <el-button
          circle
          size="small"
          :type="isFav ? 'danger' : 'default'"
          :plain="!isFav"
          class="pb-fav"
          @click="toggleFavorite"
        >
          <el-icon><StarFilled v-if="isFav" /><Star v-else /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip v-if="currentSong && !currentSong.isLocal && !currentSong.isCustomSource" content="以当前歌曲开启相似电台" placement="top">
        <el-button class="pb-radio" circle size="small" aria-label="开启相似歌曲电台" @click="openRadio">
          <el-icon><Headset /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip v-if="currentSong" content="快速换源：为当前曲目换一个可用音源" placement="top">
        <el-button
          class="pb-switch"
          circle
          size="small"
          aria-label="为当前曲目换源"
          data-testid="switch-source-current"
          @click="switchDialogVisible = true"
        >
          <el-icon><Switch /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip v-if="canDownloadCurrent" content="下载当前歌曲到本地" placement="top">
        <el-button class="pb-download" circle size="small" aria-label="下载当前歌曲" @click="downloadCurrent">
          <el-icon><Download /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip v-if="canDislikeCurrent" :content="currentDisliked ? '取消不喜欢当前歌曲' : '不喜欢当前歌曲（之后自动跳过）'" placement="top">
        <el-button
          class="pb-dislike"
          circle
          size="small"
          :type="currentDisliked ? 'danger' : 'default'"
          :plain="!currentDisliked"
          :aria-label="currentDisliked ? '取消不喜欢当前歌曲' : '不喜欢当前歌曲'"
          @click="toggleDislikeCurrent"
        >
          <el-icon><CircleClose /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 中间：播放控制 + 进度 -->
    <div class="pb-center">
      <div class="pb-controls">
        <el-tooltip content="上一首 · Shift + ←" placement="top">
          <el-button circle :disabled="!hasSong" aria-label="播放上一首" @click="prev">
            <el-icon><DArrowLeft /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="buffering ? '正在缓冲…' : '播放 / 暂停 · 空格'" placement="top">
          <el-button
            class="pb-play"
            circle
            :class="{ 'is-buffering': buffering }"
            :disabled="!hasSong"
            :aria-label="playing ? '暂停' : '播放'"
            :aria-busy="buffering ? 'true' : 'false'"
            @click="togglePlay"
          >
            <el-icon v-if="buffering" class="spin"><Loading /></el-icon>
            <el-icon v-else-if="playing"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="下一首 · Shift + →" placement="top">
          <el-button circle :disabled="!hasSong" aria-label="播放下一首" @click="next">
            <el-icon><DArrowRight /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip :content="'播放模式：' + playerStore.modeLabel" placement="top">
          <el-button circle text @click="playerStore.toggleMode()">
            <el-icon v-if="playerStore.mode === 'loop'"><Refresh /></el-icon>
            <el-icon v-else-if="playerStore.mode === 'single'"><RefreshRight /></el-icon>
            <el-icon v-else-if="playerStore.mode === 'random'"><Switch /></el-icon>
            <el-icon v-else-if="playerStore.mode === 'shuffle'"><Sort /></el-icon>
            <el-icon v-else-if="playerStore.mode === 'heart'"><MagicStick /></el-icon>
            <el-icon v-else><Histogram /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip v-if="audioError" content="重新加载当前音频" placement="top">
          <el-button class="pb-retry" circle text aria-label="重新加载当前音频" @click="retryAudio">
            <el-icon><RefreshRight /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
      <div class="pb-progress">
        <span class="pb-time">{{ fmtDuration(displayTime) }}</span>
        <div
          class="progress-track"
          ref="trackRef"
          role="slider"
          tabindex="0"
          aria-label="播放进度"
          :aria-valuemin="0"
          :aria-valuemax="Math.round(playerStore.duration || 0)"
          :aria-valuenow="Math.round(displayTime || 0)"
          :aria-valuetext="`${fmtDuration(displayTime)} / ${fmtDuration(playerStore.duration)}`"
          :aria-busy="buffering ? 'true' : 'false'"
          :class="{ 'is-dragging': dragging, 'is-buffering': buffering, 'is-disabled': !playerStore.duration }"
          @pointerdown="onProgressPointerDown"
          @pointermove="onProgressPointerMove"
          @pointerup="onProgressPointerUp"
          @pointercancel="onProgressPointerCancel"
          @pointerleave="onProgressPointerLeave"
          @click="onSeek"
          @keydown.left.prevent="onProgressKeydown"
          @keydown.right.prevent="onProgressKeydown"
          @keydown.up.prevent="onProgressKeydown"
          @keydown.down.prevent="onProgressKeydown"
          @keydown.page-up.prevent="seekByKeyboard(-30)"
          @keydown.page-down.prevent="seekByKeyboard(30)"
          @keydown.home.prevent="seekTo(0)"
          @keydown.end.prevent="seekTo(playerStore.duration)"
        >
          <div class="progress-buffered" :style="{ width: bufferedPercent + '%' }"></div>
          <div class="progress-inner" :style="{ width: displayPercent + '%' }">
            <div class="progress-dot"></div>
          </div>
          <div
            v-if="hoverRatio !== null && playerStore.duration"
            class="progress-bubble"
            :style="{ left: (hoverRatio * 100) + '%' }"
          >{{ fmtDuration(hoverRatio * playerStore.duration) }}</div>
        </div>
        <span class="pb-time">{{ fmtDuration(playerStore.duration) }}</span>
      </div>
    </div>

    <!-- 右侧：睡眠定时 / 音量 / 歌词 / 队列 -->
    <div class="pb-right">
      <el-popover v-model:visible="sleepTimerVisible" placement="top" trigger="click" :width="260">
        <template #reference>
          <el-button
            circle
            text
            class="pb-sleep"
            :class="{ active: sleepTimerActive }"
            :aria-label="sleepTimerActive ? `睡眠定时：${sleepTimerSummary}` : '睡眠定时'"
            :title="sleepTimerActive ? sleepTimerSummary : '睡眠定时'"
          >
            <el-icon><AlarmClock /></el-icon>
          </el-button>
        </template>
        <div class="sleep-panel">
          <div>
            <div class="sleep-title">睡眠定时</div>
            <div class="sleep-subtitle">到时暂停播放，不清空队列</div>
          </div>
          <div v-if="playerStore.sleepTimerMode === 'duration'" class="sleep-status" role="status">
            <el-icon><Clock /></el-icon>
            <span>约 {{ sleepTimerRemainingLabel }} 后暂停</span>
          </div>
          <div v-else-if="playerStore.sleepTimerMode === 'track'" class="sleep-status" role="status">
            <el-icon><VideoPause /></el-icon>
            <span>《{{ currentSong?.title || '当前歌曲' }}》结束后停止</span>
          </div>
          <div class="sleep-options">
            <el-button
              v-for="minutes in SLEEP_TIMER_MINUTES"
              :key="minutes"
              size="small"
              plain
              @click="startSleepTimer(minutes)"
            >
              {{ minutes }} 分钟
            </el-button>
          </div>
          <el-button class="sleep-current" size="small" plain :disabled="!hasSong" @click="stopAfterCurrentSong">
            播完当前歌曲停止
          </el-button>
          <el-button v-if="sleepTimerActive" class="sleep-cancel" text size="small" @click="cancelSleepTimer">
            取消定时
          </el-button>
          <div class="sleep-note">按本机时间计时，暂停时仍倒计时；刷新会清除，系统挂起页面时可能延迟触发。</div>
          <div class="sleep-note">手动切歌会取消“播完当前歌曲”定时。</div>
        </div>
      </el-popover>
      <el-popover v-model:visible="equalizerVisible" placement="top" trigger="click" :width="320">
        <template #reference>
          <!-- 原生 title 而不是 el-tooltip：在 popover 的 reference 插槽里再套一个 tooltip 会
               触发「Runtime directive used on component with non-element root node」告警。 -->
          <el-button
            circle
            text
            class="pb-equalizer"
            :class="{ active: playerStore.equalizerActive }"
            :disabled="Boolean(processingBlocker)"
            :title="processingBlocker ? `${processingBlocker}（均衡器已置灰）` : '均衡器与音效预设'"
            aria-label="均衡器与音效预设"
            :aria-expanded="equalizerVisible ? 'true' : 'false'"
          >
            <el-icon><Operation /></el-icon>
          </el-button>
        </template>
        <div class="equalizer-panel">
          <div class="equalizer-head">
            <span>均衡器</span>
            <el-button text size="small" :disabled="!playerStore.equalizerActive" @click="resetEqualizer">恢复原声</el-button>
          </div>
          <div class="equalizer-presets">
            <button
              v-for="preset in EQ_PRESETS"
              :key="preset.key"
              type="button"
              class="equalizer-preset"
              :class="{ active: playerStore.equalizer.preset === preset.key }"
              :aria-pressed="playerStore.equalizer.preset === preset.key ? 'true' : 'false'"
              @click="applyEqualizerPreset(preset.key)"
            >{{ preset.label }}</button>
          </div>
          <div class="equalizer-bands">
            <div v-for="(band, index) in EQ_BANDS" :key="band.frequency" class="equalizer-band">
              <input
                type="range"
                class="equalizer-slider"
                :min="-EQ_GAIN_LIMIT"
                :max="EQ_GAIN_LIMIT"
                step="0.5"
                :value="playerStore.equalizerGains[index]"
                :aria-label="`${band.label}Hz 增益`"
                @input="onEqualizerBand(index, $event)"
              />
              <span class="equalizer-value">{{ formatGain(playerStore.equalizerGains[index]) }}</span>
              <span class="equalizer-freq">{{ band.label }}</span>
            </div>
          </div>
          <p v-if="processingBlocker" class="equalizer-note is-blocked">{{ processingBlocker }}，均衡器与 3D 空间音效已置灰，当前保持原声。</p>
          <p class="equalizer-note">均衡器与 3D 空间音效都要经过音频处理链路，跨域/自定义源音源不生效（会保持原声）。</p>
          <div class="loudness-section">
            <div class="loudness-head">
              <span>响度归一化</span>
              <button
                type="button"
                class="loudness-measure"
                :disabled="loudnessMeasuring || !playerStore.currentSong || Boolean(processingBlocker)"
                :title="processingBlockerTip"
                @click="measureLoudness"
              >
                {{ loudnessMeasuring ? '测量中…' : '测量当前曲目' }}
              </button>
            </div>
            <div class="loudness-targets">
              <button
                v-for="option in LOUDNESS_TARGETS"
                :key="option.key"
                type="button"
                class="loudness-target"
                :class="{ active: loudnessStore.target === option.key }"
                :aria-pressed="loudnessStore.target === option.key ? 'true' : 'false'"
                @click="loudnessStore.setTarget(option.key)"
              >{{ option.label }}</button>
            </div>
            <p class="loudness-note">{{ currentLoudnessLabel }}</p>
          </div>
        </div>
      </el-popover>
      <el-tooltip
        :content="processingBlocker ? `${processingBlocker}（空间音效已置灰）` : (spatialEnabled ? '关闭 3D 空间音效' : '开启 3D 空间音效（本地/同源音源，耳机体验更明显）')"
        placement="top"
      >
        <el-button
          circle
          text
          class="pb-spatial"
          :class="{ active: spatialEnabled }"
          :disabled="!hasSong || Boolean(processingBlocker)"
          :aria-label="spatialEnabled ? '关闭 3D 空间音效' : '开启 3D 空间音效'"
          :aria-pressed="spatialEnabled"
          @click="toggleSpatialAudio()"
        >
          <el-icon><Headset /></el-icon>
        </el-button>
      </el-tooltip>
      <div class="pb-volume-group">
        <el-tooltip :content="muted ? '取消静音 · M' : '静音 · M'" placement="top">
          <el-button circle text class="pb-mute" :aria-label="muted ? '取消静音' : '静音'" :aria-pressed="muted" @click="toggleMute">
            <el-icon><Mute v-if="muted || volumePercent === 0" /><Mic v-else /></el-icon>
          </el-button>
        </el-tooltip>
        <div class="pb-volume" :title="`音量 ${volumePercent}%`" @wheel.prevent="onVolumeWheel">
          <el-slider
            v-model="volumeSlider"
            :min="0"
            :max="100"
            :show-tooltip="false"
            :disabled="muted"
            aria-label="音量"
            @input="onVolume"
          />
        </div>
        <span class="pb-volume-value" aria-hidden="true">{{ volumePercent }}</span>
      </div>
      <el-tooltip :content="`播放速度 · 当前 ${playbackRateLabel}`" placement="top">
        <el-button
          class="pb-rate"
          circle
          text
          :aria-label="`播放速度：${playbackRateLabel}，点击切换`"
          :title="`播放速度：${playbackRateLabel}`"
          @click="cycleRate"
        >{{ playbackRateLabel }}</el-button>
      </el-tooltip>
      <el-popover v-model:visible="shortcutsVisible" placement="top" trigger="click" :width="280">
        <template #reference>
          <el-button
            circle
            text
            class="pb-shortcuts"
            aria-label="快捷键说明"
            :aria-expanded="shortcutsVisible ? 'true' : 'false'"
          >
            <el-icon><InfoFilled /></el-icon>
          </el-button>
        </template>
        <div class="shortcut-panel">
          <div class="shortcut-title">播放器快捷键</div>
          <ul class="shortcut-list">
            <li v-for="item in SHORTCUT_HELP" :key="item.keys">
              <kbd>{{ item.keys }}</kbd>
              <span>{{ item.desc }}</span>
            </li>
          </ul>
          <p class="shortcut-note">在输入框里输入时以上快捷键不生效。</p>
        </div>
      </el-popover>
      <el-tooltip content="歌词 · L" placement="top">
        <el-button circle text :class="{ active: playerStore.lyricVisible }" :aria-label="playerStore.lyricVisible ? '关闭歌词' : '显示歌词'" @click="toggleLyric">
          <el-icon><ChatLineSquare /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="播放队列 · Q" placement="top">
        <span class="queue-trigger" @click.stop="openQueue">
          <el-badge :value="playerStore.queue.length" :hidden="playerStore.queue.length === 0" type="primary">
            <el-button
              circle
              text
              aria-label="播放队列"
              :aria-expanded="queueVisible"
            >
              <el-icon><List /></el-icon>
            </el-button>
          </el-badge>
        </span>
      </el-tooltip>
      <button
        v-if="audioContextStalled"
        type="button"
        class="pb-audio-retry"
        title="音频上下文被浏览器挂起：进度在走但没有声音"
        @click="retryAudioContext"
      >声音没出来？重试</button>
      <el-popover v-model:visible="statsVisible" placement="top" trigger="click" :width="320">
        <template #reference>
          <el-button circle text class="pb-stats" aria-label="收听统计" :aria-expanded="statsVisible ? 'true' : 'false'">
            <el-icon><DataAnalysis /></el-icon>
          </el-button>
        </template>
        <div class="stats-panel">
          <div class="stats-row">
            <div class="stats-block">
              <div class="stats-label">今日</div>
              <div class="stats-value">{{ formatSeconds(statsStore.today.seconds) }}</div>
              <div class="stats-sub">{{ statsStore.today.effectivePlays }} 首听完 · 跳过率 {{ formatPercent(statsStore.today.skipRate) }}</div>
            </div>
            <div class="stats-block">
              <div class="stats-label">累计</div>
              <div class="stats-value">{{ formatSeconds(statsStore.total.seconds) }}</div>
              <div class="stats-sub">{{ statsStore.total.plays }} 次起播 · 完成率 {{ formatPercent(statsStore.total.completionRate) }}</div>
            </div>
          </div>
          <div class="stats-trend" aria-label="近 7 天收听趋势">
            <div v-for="day in statsStore.trend" :key="day.day" class="stats-trend-col">
              <div class="stats-trend-bar" :style="{ height: trendHeight(day.seconds) }" :title="`${day.day}：${formatSeconds(day.seconds)}`" />
              <div class="stats-trend-day">{{ day.day.slice(5) }}</div>
            </div>
          </div>
          <div v-if="statsStore.total.topSongs.length" class="stats-section">
            <div class="stats-label">听得最多的曲目</div>
            <div v-for="item in statsStore.total.topSongs" :key="item.title" class="stats-line">
              <span class="stats-line-name">{{ item.title }}</span>
              <span class="stats-line-value">{{ formatSeconds(item.seconds) }}</span>
            </div>
          </div>
          <div v-if="statsStore.total.topArtists.length" class="stats-section">
            <div class="stats-label">听得最多的艺人</div>
            <div v-for="item in statsStore.total.topArtists" :key="item.artist" class="stats-line">
              <span class="stats-line-name">{{ item.artist }}</span>
              <span class="stats-line-value">{{ formatSeconds(item.seconds) }}</span>
            </div>
          </div>
          <div v-if="statsStore.total.sourceErrors.length" class="stats-section">
            <div class="stats-label">播放失败来源</div>
            <div v-for="item in statsStore.total.sourceErrors" :key="item.source" class="stats-line">
              <span class="stats-line-name">{{ item.source }}</span>
              <span class="stats-line-value">{{ item.count }} 次</span>
            </div>
          </div>
          <p class="stats-note">统计只存在这台设备的浏览器里，不上报；近 7 天 {{ formatSeconds(statsStore.last7Days.seconds) }}。</p>
          <button type="button" class="stats-clear" @click="statsStore.clear()">清空统计</button>
        </div>
      </el-popover>
      <el-popover v-model:visible="crossfadeVisible" placement="top" trigger="click" :width="220">
        <template #reference>
          <el-button
            circle
            text
            class="pb-crossfade"
            :class="{ active: playerStore.crossfadeMs > 0 }"
            aria-label="切歌交叉淡入淡出"
            :aria-expanded="crossfadeVisible ? 'true' : 'false'"
          >
            <el-icon><Connection /></el-icon>
          </el-button>
        </template>
        <div class="crossfade-panel">
          <div class="crossfade-title">切歌交叉淡入淡出</div>
          <div class="crossfade-options">
            <button
              v-for="option in CROSSFADE_OPTIONS"
              :key="option"
              type="button"
              class="crossfade-option"
              :class="{ active: playerStore.crossfadeMs === option }"
              :aria-pressed="playerStore.crossfadeMs === option ? 'true' : 'false'"
              @click="playerStore.setCrossfade(option)"
            >{{ option === 0 ? '关闭' : `${option}ms` }}</button>
          </div>
          <p class="crossfade-note">原声模式下用第二个媒体元素重叠播放，消除切歌爆音与间隙；开启空间音效或均衡器时自动让位（那个元素被处理链路占用）。</p>
        </div>
      </el-popover>
      <el-popover v-if="isCompactView" v-model:visible="dockVisible" placement="top" trigger="click" :width="220">
        <template #reference>
          <el-button
            circle
            text
            class="pb-dock"
            aria-label="播放条停靠位置"
            :aria-expanded="dockVisible ? 'true' : 'false'"
          >
            <el-icon><Rank /></el-icon>
          </el-button>
        </template>
        <div class="dock-panel">
          <div class="dock-title">停靠位置</div>
          <div class="dock-options">
            <button
              v-for="item in PLAYER_DOCKS"
              :key="item.key"
              type="button"
              class="dock-option"
              :class="{ active: dock === item.key }"
              :aria-pressed="dock === item.key ? 'true' : 'false'"
              @click="playerStore.setPlayerBarDock(item.key)"
            >{{ item.label }}</button>
          </div>
          <label class="dock-switch">
            <input type="checkbox" :checked="playerStore.playerBarAutoHide" @change="onAutoHideChange" />
            <span>贴边时鼠标离开自动淡出</span>
          </label>
        </div>
      </el-popover>
      <el-tooltip :content="`播放器形态：${viewModeLabel} · V`" placement="top">
        <el-button
          circle
          text
          class="pb-view-mode"
          :aria-label="`播放器形态：${viewModeLabel}，点击切换到${nextViewModeLabel}`"
          @click="cycleViewMode"
        >
          <el-icon><FullScreen v-if="viewMode === 'immersive'" /><Crop v-else-if="viewMode === 'mini'" /><View v-else /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 原声播放器始终保留；空间音效使用独立媒体元素，确保跨域音源可安全回退原声。 -->
    <audio ref="audioRef" preload="auto"></audio>
    <SourceSwitchDialog v-model="switchDialogVisible" :song="currentSong" />
    <audio ref="spatialAudioRef" preload="none"></audio>
  </div>

  <!-- 全屏正在播放页（第四种形态）：大封面 + 当前队列，歌词仍只有歌词面板一处渲染 -->
  <NowPlayingStage
    v-if="viewMode === 'stage'"
    :is-favorite="isFav"
    :disliked="currentDisliked"
    @close="playerStore.setPlayerViewMode('standard')"
    @toggle-favorite="toggleFavorite"
    @download="downloadCurrent"
    @dislike="toggleDislikeCurrent"
    @switch-source="switchDialogVisible = true"
    @open-queue="openQueue"
  />

  <!-- 播放队列抽屉 -->
  <el-drawer v-model="queueVisible" title="播放队列" :size="queueDrawerSize" append-to-body>
    <div class="queue-toolbar">
      <span class="queue-count">
        共 {{ playerStore.queue.length }} 首<template v-if="playerStore.queueDuration"> · {{ fmtDuration(playerStore.queueDuration) }}</template>
      </span>
      <el-button
        size="small"
        text
        class="queue-select-toggle"
        :type="queueSelectMode ? 'primary' : 'default'"
        :aria-pressed="queueSelectMode ? 'true' : 'false'"
        @click="toggleQueueSelectMode"
      >{{ queueSelectMode ? '退出多选' : '多选' }}</el-button>
      <div class="queue-tools">
        <el-tooltip content="随机重排队列，正在播放的曲目保持不动" placement="top">
          <el-button size="small" plain :disabled="playerStore.queue.length < 2" aria-label="随机打乱播放队列" @click="shuffleQueue">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="移除队列里重复的曲目" placement="top">
          <el-button size="small" plain :disabled="playerStore.queue.length < 2" aria-label="移除队列中的重复歌曲" @click="dedupeQueue">
            <el-icon><CircleClose /></el-icon>
          </el-button>
        </el-tooltip>
        <input
          ref="localFileInput"
          class="local-file-input"
          type="file"
          accept="audio/*,.aac,.aif,.aiff,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.weba,.webm"
          multiple
          aria-label="选择本地音乐文件"
          @change="onLocalFilesSelected"
        />
        <el-tooltip content="选择音频文件后仅在本机浏览器播放，不会上传到服务器" placement="top">
          <el-button size="small" plain @click="openLocalFilePicker">
            <el-icon><Upload /></el-icon> 导入本地音乐
          </el-button>
        </el-tooltip>
        <el-button size="small" class="queue-save-playlist" plain :disabled="playerStore.queue.length === 0" @click="saveQueueAsPlaylist">
          存为新歌单
        </el-button>
        <el-button size="small" type="danger" plain :disabled="playerStore.queue.length === 0" @click="clearQueue">
          清空队列
        </el-button>
      </div>
    </div>
    <el-dialog v-model="playlistPickerVisible" title="把选中的歌曲加入歌单" width="min(440px, calc(100vw - 32px))" append-to-body>
      <p v-if="playlistsLoading">正在读取你的歌单…</p>
      <p v-else-if="!myPlaylists.length">还没有自己的歌单。可以先「存为新歌单」，或到歌单页创建后再回来。</p>
      <fieldset v-else class="playlist-picker">
        <legend>选择要加入的歌单</legend>
        <label v-for="item in myPlaylists" :key="item.id" class="playlist-option">
          <input v-model="targetPlaylistId" type="radio" name="queue-target-playlist" :value="String(item.id)">
          <span>{{ item.name }}</span>
        </label>
      </fieldset>
      <template #footer>
        <el-button @click="playlistPickerVisible = false">取消</el-button>
        <el-button
          type="primary"
          class="queue-add-playlist-confirm"
          :loading="addingToPlaylist"
          :disabled="!targetPlaylistId || playlistsLoading"
          @click="confirmAddSelectedToPlaylist"
        >加入</el-button>
      </template>
    </el-dialog>
    <section class="local-library" aria-label="本机音乐与离线副本">
      <div class="local-library-row">
        <button type="button" class="local-library-button" :disabled="!persistentHandlesSupported" @click="rememberLocalFiles">记住本地文件</button>
        <button type="button" class="local-library-button" :disabled="rememberedHandles.length === 0" @click="restoreRememberedFiles">恢复已记住的本地音乐</button>
      </div>
      <p class="local-library-note">{{ persistentHandlesSupported ? '授权后句柄留在本机，刷新可再次请求权限。文件不会上传。' : '当前浏览器不能记住文件句柄，刷新后需要重新选择。' }}</p>
      <button
        v-if="canSaveDemoAudio"
        type="button"
        class="local-library-button"
        :aria-label="demoCached ? '删除当前歌曲的演示副本' : `保存《${currentSong.title}》的演示音频到本机`"
        @click="toggleDemoCache"
      >{{ demoCached ? '删除当前演示副本' : '保存当前演示音频' }}</button>
      <ul v-if="rememberedHandles.length" class="local-library-list">
        <li v-for="item in rememberedHandles" :key="item.id">
          <span>{{ item.name }}</span>
          <button type="button" :aria-label="`忘记本地文件《${item.name}》`" @click="forgetHandle(item.id)">忘记</button>
        </li>
      </ul>
      <ul v-if="cachedDemoAudio.length" class="local-library-list">
        <li v-for="clip in cachedDemoAudio" :key="clip.path">
          <span>{{ clip.title }} · 演示副本</span>
          <button type="button" :aria-label="`删除《${clip.title}》的离线副本`" @click="removeCachedDemo(clip.path)">删除</button>
        </li>
      </ul>
    </section>
    <el-input
      v-if="playerStore.queue.length > 0"
      v-model="queueKeyword"
      class="queue-search"
      size="small"
      clearable
      placeholder="在队列里搜索歌名或歌手"
      aria-label="在播放队列里搜索"
    />
    <div v-if="playerStore.queue.length === 0" class="queue-empty">队列空空如也，点上方“导入本地音乐”选择文件，或去曲库挑几首歌吧～</div>
    <div v-else-if="filteredQueue.length === 0" class="queue-empty">没有匹配「{{ queueKeyword }}」的曲目</div>
    <div v-if="queueSelectMode && playerStore.queue.length > 0" class="queue-batch">
      <div class="queue-batch-actions">
        <el-button size="small" round :disabled="selectedQueueIndices.length === 0" @click="setSelectedAsNext">排到下一首</el-button>
        <el-button size="small" round :disabled="selectedQueueIndices.length === 0" @click="moveSelectedToTop">移到队首</el-button>
        <el-button size="small" round class="queue-add-playlist" :disabled="selectedQueueIndices.length === 0" @click="openAddSelectedToPlaylist">加入歌单</el-button>
        <el-button size="small" round type="danger" plain :disabled="selectedQueueIndices.length === 0" @click="removeSelected">移除所选</el-button>
        <el-button size="small" text @click="clearQueueSelection">清空选择</el-button>
      </div>
      <p class="queue-batch-note">已选 {{ selectedQueueIndices.length }} 首<template v-if="selectedQueueIndices.length > 0"> · 可用 Ctrl/⌘ + 点击 或 Shift + 点击 连选</template></p>
    </div>
    <ul
      v-if="filteredQueue.length > 0"
      class="queue-list"
      role="listbox"
      aria-label="播放队列（可拖拽排序、支持键盘操作）"
    >
      <li
        v-for="entry in filteredQueue"
        :key="`${entry.index}-${entry.song.id}`"
        class="queue-item"
        :ref="(element) => setQueueItemRef(element, entry.index === playerStore.currentIndex)"
        :class="{
          active: entry.index === playerStore.currentIndex,
          dragging: dragIndex === entry.index,
          'drop-target': dropIndex === entry.index && dragIndex !== entry.index,
          selected: isQueueIndexSelected(entry.index)
        }"
        role="option"
        tabindex="0"
        :aria-selected="entry.index === playerStore.currentIndex ? 'true' : 'false'"
        :aria-label="`第 ${entry.index + 1} 首：${entry.song.title}`"
        :draggable="canDragQueue ? 'true' : 'false'"
        @click="onQueueItemClick($event, entry.index)"
        @keydown="onQueueItemKeydown($event, entry)"
        @dragstart="onQueueDragStart($event, entry.index)"
        @dragover.prevent="onQueueDragOver(entry.index)"
        @drop.prevent="onQueueDrop(entry.index)"
        @dragend="onQueueDragEnd"
      >
        <input
          v-if="queueSelectMode"
          type="checkbox"
          class="queue-checkbox"
          :checked="isQueueIndexSelected(entry.index)"
          :aria-label="`选择《${entry.song.title}》`"
          @click.stop
          @change="toggleQueueSelection(entry.index, $event)"
        />
      <div class="queue-cover"><Cover :src="entry.song.cover" :text="entry.song.title" :size="36" :anonymous="Boolean(entry.song.isCustomSource)" /></div>
      <div class="queue-meta">
        <div class="queue-title">{{ entry.song.title }}</div>
        <div class="queue-artist">
          {{ entry.song.singerName }}
          <el-tag v-if="entry.song.isLocal" size="small" effect="plain" class="queue-local-tag">本地</el-tag>
          <el-tag v-else-if="entry.song.isCustomSource" size="small" effect="plain" class="queue-local-tag">
            {{ entry.song.sourceName ? `${entry.song.sourceName} · ${entry.song.sourcePlatform || '自定义源'}` : entry.song.sourcePlatform || '自定义源' }}
          </el-tag>
        </div>
      </div>
      <div class="queue-item-actions">
        <button
          type="button"
          class="queue-action-button"
          title="上移一位"
          :disabled="entry.index === 0"
          :aria-label="`上移《${entry.song.title}》`"
          @click.stop="playerStore.moveQueueItem(entry.index, entry.index - 1)"
        >
          <el-icon><ArrowUp /></el-icon>
        </button>
        <button
          type="button"
          class="queue-action-button"
          title="下移一位"
          :disabled="entry.index === playerStore.queue.length - 1"
          :aria-label="`下移《${entry.song.title}》`"
          @click.stop="playerStore.moveQueueItem(entry.index, entry.index + 1)"
        >
          <el-icon><ArrowDown /></el-icon>
        </button>
        <button
          type="button"
          class="queue-action-button"
          title="从队列移除"
          :aria-label="`从播放队列移除《${entry.song.title}》`"
          @click.stop="playerStore.removeAt(entry.index)"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
      </li>
    </ul>
    <p v-if="playerStore.queue.length > 0" class="queue-hint">
      {{ canDragQueue ? '拖动条目可调整顺序；聚焦某行后按回车播放、Delete 移除、Alt + ↑/↓ 移动。' : '清空搜索框后可拖动排序；聚焦某行按回车播放、Delete 移除、Alt + ↑/↓ 移动。' }}
    </p>
  </el-drawer>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CROSSFADE_OPTIONS,
  PLAYER_DOCKS,
  PLAYER_VIEW_MODES,
  SLEEP_TIMER_MINUTES,
  getSessionSongResolver,
  isSessionSnapshotFresh,
  usePlayerStore
} from '@/store/player'
import { useUserStore } from '@/store/user'
import { useDislikeStore } from '@/store/dislike'
import { useDownloadStore } from '@/store/downloads'
import { useStatsStore } from '@/store/stats'
import { useLoudnessStore } from '@/store/loudness'
import { LOUDNESS_TARGETS, applyGainToVolume, describeLufs, measureAudioLoudness } from '@/utils/loudness'
import { formatSeconds, formatPercent } from '@/utils/playStats'
import * as favoriteApi from '@/api/favorite'
import * as playlistApi from '@/api/playlist'
import { fmtDuration } from '@/utils/format'
import { MEDIA_ERR_NETWORK, isPlaybackStalled, isTransientAudioError, nextRetryDelay, hasProgress } from '@/utils/audioRetry'
import { nextPreloadIndex, shouldPreloadNext } from '@/utils/audioPreload'
import {
  describeQueueSaveResult,
  partitionQueueForPlaylist,
  suggestQueuePlaylistName
} from '@/utils/queueToPlaylist'
import { createMediaSessionController } from '@/utils/mediaSession'
import {
  EQ_BANDS,
  EQ_GAIN_LIMIT,
  EQ_PRESETS,
  createSpatialAudioGraph,
  explainAudioProcessingBlocker,
  isSpatialAudioUrl
} from '@/utils/spatialAudio'
const SourceSwitchDialog = defineAsyncComponent(() => import('./SourceSwitchDialog.vue'))
import {
  filesFromGrantedHandles,
  forgetRememberedHandle,
  listRememberedHandles,
  rememberHandle,
  supportsPersistentFileHandles
} from '@/utils/localLibrary'
import {
  deleteCachedDemoAudio,
  demoAudioPath,
  hasCachedDemoAudio,
  isOwnDemoAudioUrl,
  listCachedDemoAudio,
  objectUrlForCachedDemo,
  saveOwnDemoAudio
} from '@/utils/demoAudioCache'
import HoloProjector from './HoloProjector.vue'
import NowPlayingStage from './NowPlayingStage.vue'
import Cover from './Cover.vue'

const playerStore = usePlayerStore()
const userStore = useUserStore()
const dislikeStore = useDislikeStore()
const downloadStore = useDownloadStore()
const router = useRouter()

const audioRef = ref(null)
const switchDialogVisible = ref(false)
const spatialAudioRef = ref(null)
const spatialEnabled = ref(false)
/** 播放是否已接入 Web Audio 处理链路（空间音效或均衡器在用）。 */
const processedEnabled = ref(false)
const trackRef = ref(null)
let spatialAudioGraph = null
let mediaSessionController = null
let lastMediaSessionPositionAt = 0
const localFileInput = ref(null)
const persistentHandlesSupported = supportsPersistentFileHandles()
const rememberedHandles = ref([])
const cachedDemoAudio = ref([])
const demoCached = ref(false)
const offlineFallbackAttempted = ref(null)
const queueVisible = ref(false)
const sleepTimerVisible = ref(false)
const shortcutsVisible = ref(false)
/** 播放器快捷键说明：与 onPlayerShortcut 里真正实现的按键保持一致。 */
const SHORTCUT_HELP = Object.freeze([
  { keys: '空格', desc: '播放 / 暂停' },
  { keys: '←  →', desc: '快退 / 快进 5 秒' },
  { keys: '↑  ↓', desc: '进度条聚焦时快退 / 快进 10 秒' },
  { keys: '↑  ↓', desc: '其他区域调整音量 ±5%' },
  { keys: 'Shift + ← / →', desc: '上一首 / 下一首' },
  { keys: 'Home / End', desc: '跳到开头 / 结尾' },
  { keys: 'PageUp / PageDown', desc: '快退 / 快进 30 秒' },
  { keys: 'M', desc: '静音 / 取消静音' },
  { keys: 'L', desc: '打开 / 关闭歌词' },
  { keys: 'Q', desc: '打开 / 关闭播放队列' },
  { keys: 'V', desc: '切换播放器形态（标准 / 迷你 / 沉浸）' }
])

/**
 * 音频处理链路（空间音效 / 均衡器 / 响度补偿）为什么用不了。
 * 有值时相关入口一律置灰并在 tooltip 里说明原因，不再让用户点出个必然失败的提示。
 * 依赖 currentSong：切歌会重新判定（浏览器能力是静态的，但音源每次都可能不同）。
 */
const processingBlocker = computed(() => {
  void playerStore.currentSong // 显式依赖：切歌即重新判定
  return explainAudioProcessingBlocker(playerStore.currentSong, { origin: window.location.href })
})
const processingBlockerTip = computed(() =>
  processingBlocker.value ? `${processingBlocker.value}（已置灰）` : ''
)

// ---- 响度归一化（P2-10）----
const loudnessStore = useLoudnessStore()
const loudnessMeasuring = ref(false)

/** 当前曲目的补偿增益（线性倍数）：没有实测值时为 1，只走动态处理。 */
const currentLoudnessGain = computed(() =>
  loudnessStore.enabled ? loudnessStore.gainFor(playerStore.currentSong?.id) : 1
)
const currentLoudnessLabel = computed(() => loudnessStore.labelFor(playerStore.currentSong?.id))

/**
 * 实测当前曲目的响度。只有拿得到 PCM 的音源才能测（同源/本地/离线副本），
 * 跨域流媒体测不到——这时明确提示，继续沿用动态处理。
 */
async function measureLoudness() {
  const song = playerStore.currentSong
  if (!song?.audioUrl || loudnessMeasuring.value) return
  loudnessMeasuring.value = true
  try {
    const measured = await measureAudioLoudness(song.audioUrl)
    if (!measured || !Number.isFinite(measured.lufs)) {
      ElMessage.info('这首曲子拿不到音频采样，无法实测响度，已保持动态处理')
      return
    }
    loudnessStore.recordMeasurement(song.id, { lufs: measured.lufs, peak: measured.peak })
    syncAudioOutput()
    ElMessage.success(`实测 ${describeLufs(measured.lufs)}，已按目标响度补偿`)
  } catch (error) {
    // 测量失败（跨域拿不到采样、解码失败）只提示，不影响播放。
    ElMessage.info('这首曲子暂时测不出响度，已保持动态处理')
  } finally {
    loudnessMeasuring.value = false
  }
}

// ---- 收听统计（P2-8，纯本地）----
const statsStore = useStatsStore()
const statsVisible = ref(false)
let statsPosition = 0
let statsSkipGuard = false

/** 当前曲目的来源标签：用于把播放失败归因到具体音源。 */
function songSourceLabel(song) {
  if (!song) return '未知来源'
  if (song.isLocal) return '本地文件'
  if (song.isCustomSource) return '自定义源'
  if (song.sourceLabel) return song.sourceLabel
  if (song.source) return String(song.source)
  return '未知来源'
}

function recordStats(type, song, extra = {}) {
  if (!song) return
  statsStore.record({
    type,
    songId: song.id ?? null,
    title: song.title || song.name || '',
    artist: song.artist || song.singerName || '',
    source: songSourceLabel(song),
    duration: Number(song.duration) || 0,
    position: Math.max(0, Number(extra.position ?? statsPosition) || 0)
  })
}

/** 趋势条高度：按近 7 天最大值归一化，全 0 时保持一条底线。 */
function trendHeight(seconds) {
  const max = Math.max(...statsStore.trend.map((day) => day.seconds), 1)
  const ratio = Math.max(0, Math.min(1, Number(seconds) / max))
  return `${Math.round(8 + ratio * 52)}px`
}

// ---- 交叉淡入淡出 ----
const crossfadeVisible = ref(false)

// ---- 会话续播（P2-7）：整份队列 + 位置 + 模式 + 倍速 ----
const resumePrompt = ref(null)
let lastSessionPersist = 0

function checkSessionResume() {
  const snapshot = playerStore.sessionSnapshot
  if (!snapshot || playerStore.queue.length > 0) return
  if (!isSessionSnapshotFresh(snapshot)) {
    playerStore.clearSessionSnapshot()
    return
  }
  const ids = Array.isArray(snapshot.queueIds) ? snapshot.queueIds : []
  const index = Math.max(0, ids.indexOf(snapshot.currentSongId))
  resumePrompt.value = { count: ids.length, index: index + 1, position: fmtDuration(Math.floor(snapshot.position || 0)) }
}

async function resumeSession() {
  if (!resumePrompt.value) return
  resumePrompt.value = null
  const target = playerStore.consumeSessionSnapshot()
  if (!target) return
  const resolver = getSessionSongResolver()
  let songs = []
  try {
    songs = (await resolver?.(target.queueIds)) || []
  } catch {
    songs = []
  }
  songs = Array.isArray(songs) ? songs.filter(Boolean) : []
  if (songs.length === 0) {
    // 没有「按 id 取曲目」的解析器时不能假装修复：明确告知无法续播。
    ElMessage.info('上次那批曲目已不在可访问的范围里，无法续播')
    return
  }
  const index = Math.max(0, songs.findIndex((song) => song.id === target.currentSongId))
  playerStore.setPlaybackRate(target.playbackRate)
  playerStore.setMode(target.mode)
  // 位置沿用既有的单曲续播机制（太靠开头/结尾会被自动忽略）。
  const startSong = songs[index]
  playerStore.saveResumePosition(startSong?.id, target.position)
  playerStore.playAll(songs, startSong?.id)
  ElMessage.success(`继续上次的收听：第 ${index + 1} 首 · ${fmtDuration(Math.floor(target.position || 0))}`)
}

function ignoreSession() {
  resumePrompt.value = null
  playerStore.clearSessionSnapshot()
}

function persistSession({ force = false } = {}) {
  if (playerStore.queue.length === 0) return
  const now = Date.now()
  if (!force && now - lastSessionPersist < 15000) return
  lastSessionPersist = now
  playerStore.saveSessionSnapshot({ now })
}

function handlePageHide() {
  resetAutoRetry()
  stopStallWatch()
  releasePreloadAudio()
  persistSession({ force: true })
  statsStore.flush()
}

// ---- 迷你 / 沉浸形态的停靠与自动隐藏 ----
const dockVisible = ref(false)
const barFaded = ref(false)
const dock = computed(() => playerStore.playerBarDock)
/** 只有贴边（左/右）时才需要自动淡出；吸底形态一直可见。 */
const docked = computed(() => isCompactView.value && dock.value !== 'bottom')
let fadeTimer = null
let gripPointerId = null

function onAutoHideChange(event) {
  playerStore.setPlayerBarAutoHide(Boolean(event?.target?.checked))
  if (!playerStore.playerBarAutoHide) cancelBarFade()
}

function cancelBarFade() {
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  barFaded.value = false
}

function scheduleBarFade() {
  stopCrossfade()
  cancelBarFade()
  if (!docked.value || !playerStore.playerBarAutoHide) return
  fadeTimer = setTimeout(() => { barFaded.value = true }, 3000)
}

function onGripPointerDown(event) {
  if (event?.button != null && event.button !== 0) return
  gripPointerId = event?.pointerId ?? null
  event?.target?.setPointerCapture?.(event.pointerId)
  cancelBarFade()
}

/** 拖动把手：靠近左/右边缘 25% 时切换停靠，松手才写入偏好。 */
function onGripPointerMove(event) {
  if (gripPointerId === null || !event?.clientX) return
  const width = window.innerWidth || 1
  const ratio = event.clientX / width
  const next = ratio < 0.25 ? 'left' : (ratio > 0.75 ? 'right' : 'bottom')
  if (next !== dock.value) playerStore.playerBarDock = next
}

function onGripPointerUp(event) {
  if (gripPointerId === null) return
  gripPointerId = null
  event?.target?.releasePointerCapture?.(event.pointerId)
  playerStore.setPlayerBarDock(playerStore.playerBarDock)
}

// ---- 均衡器 ----
const equalizerVisible = ref(false)

function formatGain(value) {
  const number = Number(value) || 0
  if (Math.abs(number) < 0.05) return '0'
  return `${number > 0 ? '+' : ''}${number.toFixed(1)}`
}

function applyEqualizerPreset(key) {
  playerStore.setEqualizerPreset(key)
}

function onEqualizerBand(index, event) {
  const value = Number(event?.target?.value)
  if (!Number.isFinite(value)) return
  playerStore.setEqualizerBand(index, value)
}

function resetEqualizer() {
  playerStore.resetEqualizer()
}

// ---- 播放器形态：标准 / 迷你 / 沉浸 ----
const viewMode = computed(() => playerStore.playerViewMode)
const isCompactView = computed(() => viewMode.value !== 'standard')
const viewModeLabel = computed(() => PLAYER_VIEW_MODES.find((mode) => mode.key === viewMode.value)?.label || '标准')
const nextViewModeLabel = computed(() => {
  const keys = PLAYER_VIEW_MODES.map((mode) => mode.key)
  const next = keys[(Math.max(0, keys.indexOf(viewMode.value)) + 1) % keys.length]
  return PLAYER_VIEW_MODES.find((mode) => mode.key === next)?.label || '标准'
})
/** 进入沉浸模式时由播放器打开的歌词舞台，退出时只关掉自己打开的那一层。 */
let openedImmersiveLyric = false

function cycleViewMode() {
  const next = playerStore.cyclePlayerViewMode()
  applyViewMode(next)
  const mode = PLAYER_VIEW_MODES.find((item) => item.key === next)
  ElMessage.info(`播放器形态：${mode?.label || next}${mode ? ` · ${mode.desc}` : ''}`)
}

function applyViewMode(mode) {
  if (mode === 'immersive') {
    playerStore.lyricVisible = true
    playerStore.setLyricView({ immersive: true })
    openedImmersiveLyric = true
    return
  }
  if (openedImmersiveLyric) {
    openedImmersiveLyric = false
    playerStore.setLyricView({ immersive: false })
    // 只在沉浸形态下自动打开过歌词：回到标准/迷你时一并收起，避免留下遮罩。
    playerStore.lyricVisible = false
  }
}

/** 迷你形态要同步改全局 --player-h，页面内容才不会被多余的留白顶住。 */
function syncViewportClass(mode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // 播放页是全屏浮层，播放条收窄但页面本身仍需要底部留白（浮层自己避让播放条）。
  const compact = mode === 'mini' || mode === 'immersive'
  root.classList.toggle('mh-player-mini', compact)
  const dockKey = compact ? playerStore.playerBarDock : 'bottom'
  root.classList.toggle('mh-player-dock-left', dockKey === 'left')
  root.classList.toggle('mh-player-dock-right', dockKey === 'right')
}
const sleepClockNow = ref(Date.now())
let sleepClockInterval = null
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const queueDrawerSize = computed(() => viewportWidth.value <= 420 ? '100%' : '380px')
const favoriteIds = ref([])

// ---- 进度条交互：拖动 / 悬停预览 / 缓冲 ----
const dragging = ref(false)
const dragTime = ref(0)
const hoverRatio = ref(null)
const bufferedPercent = ref(0)
const buffering = ref(false)
const audioError = ref(false)
const queueKeyword = ref('')
const queueCurrentItemRef = ref(null)
let dragPointerId = null
let suppressClickSeek = false
let resumeSavedAt = 0

const currentSong = computed(() => playerStore.currentSong)
const playing = computed(() => playerStore.playing)
const hasSong = computed(() => !!currentSong.value)
const sleepTimerActive = computed(() => playerStore.sleepTimerMode !== null)
const sleepTimerRemainingSeconds = computed(() => {
  if (playerStore.sleepTimerMode !== 'duration' || !playerStore.sleepTimerEndAt) return 0
  return Math.max(0, Math.ceil((playerStore.sleepTimerEndAt - sleepClockNow.value) / 1000))
})
const sleepTimerRemainingLabel = computed(() => {
  const minutes = Math.floor(sleepTimerRemainingSeconds.value / 60)
  const seconds = sleepTimerRemainingSeconds.value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})
const sleepTimerSummary = computed(() => playerStore.sleepTimerMode === 'track'
  ? '播完当前歌曲后停止'
  : `剩余 ${sleepTimerRemainingLabel.value}`)
const isFav = computed(() => currentSong.value ? favoriteIds.value.includes(currentSong.value.id) : false)
/** 拖动时显示拖动位置，否则显示真实播放进度。 */
const displayTime = computed(() => (dragging.value ? dragTime.value : playerStore.currentTime))
const displayPercent = computed(() => {
  if (!playerStore.duration) return 0
  return Math.min(100, Math.max(0, (displayTime.value / playerStore.duration) * 100))
})

// ---- 音量 / 静音 / 倍速 ----
const volumePercent = computed(() => Math.round(playerStore.volume * 100))
const muted = computed(() => playerStore.muted)
const volumeSlider = computed({
  get: () => (playerStore.muted ? 0 : Math.round(playerStore.volume * 100)),
  set: (value) => { playerStore.setVolume(Math.max(0, Math.min(100, Number(value) || 0)) / 100) }
})
const playbackRateLabel = computed(() => `${Number(playerStore.playbackRate) || 1}×`)

// ---- 当前曲目的扩展操作 ----
const canDislikeCurrent = computed(() => {
  const song = currentSong.value
  return Boolean(song && !song.isLocal && song.id != null && song.id !== '')
})
const currentDisliked = computed(() => Boolean(canDislikeCurrent.value && dislikeStore.hasSong(currentSong.value.id)))
const canDownloadCurrent = computed(() => Boolean(currentSong.value?.audioUrl && !currentSong.value.isLocal))

// ---- 队列多选与批量操作 ----
const queueSelectMode = ref(false)
const selectedQueueIndices = ref([])
let lastQueueSelectionAnchor = null

function isQueueIndexSelected(index) {
  return selectedQueueIndices.value.includes(index)
}

function toggleQueueSelectMode() {
  queueSelectMode.value = !queueSelectMode.value
  selectedQueueIndices.value = []
  lastQueueSelectionAnchor = null
}

function clearQueueSelection() {
  selectedQueueIndices.value = []
  lastQueueSelectionAnchor = null
}

function toggleQueueSelection(index, event) {
  const checked = Boolean(event?.target?.checked)
  const next = new Set(selectedQueueIndices.value)
  if (checked) next.add(index)
  else next.delete(index)
  selectedQueueIndices.value = [...next].sort((a, b) => a - b)
  lastQueueSelectionAnchor = index
}

/** 行点击：多选模式下按 Shift 连选、Ctrl/⌘ 加选，否则照常播放。 */
function onQueueItemClick(event, index) {
  if (!queueSelectMode.value) {
    playerStore.playAt(index)
    return
  }
  const selected = new Set(selectedQueueIndices.value)
  if (event?.shiftKey && Number.isInteger(lastQueueSelectionAnchor)) {
    const from = Math.min(lastQueueSelectionAnchor, index)
    const to = Math.max(lastQueueSelectionAnchor, index)
    for (let i = from; i <= to; i++) selected.add(i)
  } else if (event?.ctrlKey || event?.metaKey) {
    if (selected.has(index)) selected.delete(index)
    else selected.add(index)
  } else {
    if (selected.has(index)) selected.delete(index)
    else selected.add(index)
  }
  selectedQueueIndices.value = [...selected].sort((a, b) => a - b)
  lastQueueSelectionAnchor = index
}

/** 把所选曲目排到当前曲目之后（第一首顶掉“下一首优先”）。 */
function setSelectedAsNext() {
  const indices = selectedQueueIndices.value
  if (indices.length === 0) return
  const target = Math.max(0, playerStore.currentIndex)
  playerStore.moveQueueItems(indices, target)
  ElMessage.success(`已把 ${indices.length} 首排到当前曲目之后`)
  clearQueueSelection()
}

function moveSelectedToTop() {
  const indices = selectedQueueIndices.value
  if (indices.length === 0) return
  playerStore.moveQueueItems(indices, -1)
  ElMessage.success(`已把 ${indices.length} 首移到队首`)
  clearQueueSelection()
}

function removeSelected() {
  const indices = selectedQueueIndices.value
  if (indices.length === 0) return
  playerStore.removeQueueItems(indices)
  ElMessage.success(`已移除 ${indices.length} 首`)
  clearQueueSelection()
}

// ---- 队列搜索 / 排序 ----
const filteredQueue = computed(() => {
  const entries = playerStore.queue.map((song, index) => ({ song, index }))
  const keyword = queueKeyword.value.trim().toLowerCase()
  if (!keyword) return entries
  return entries.filter(({ song }) => [song?.title, song?.singerName, song?.album]
    .some((field) => String(field || '').toLowerCase().includes(keyword)))
})
/** 搜索过滤时拖拽的目标位置会与视觉顺序不一致，索性禁用拖拽。 */
const canDragQueue = computed(() => queueKeyword.value.trim() === '')
const dragIndex = ref(-1)
const dropIndex = ref(-1)

function onQueueItemKeydown(event, entry) {
  const index = entry?.index
  if (!Number.isInteger(index)) return
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    playerStore.playAt(index)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    playerStore.removeAt(index)
    return
  }
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && (event.altKey || event.metaKey)) {
    event.preventDefault()
    const target = event.key === 'ArrowUp' ? index - 1 : index + 1
    if (playerStore.moveQueueItem(index, target)) focusQueueItem(target)
  }
}

async function focusQueueItem(index) {
  await nextTick()
  const rows = typeof document === 'undefined' ? null : document.querySelectorAll('.queue-item')
  rows?.[index]?.focus?.()
}

function onQueueDragStart(event, index) {
  if (!canDragQueue.value) return
  dragIndex.value = index
  dropIndex.value = index
  try {
    event.dataTransfer?.setData?.('text/plain', String(index))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  } catch { /* jsdom / 旧浏览器没有 dataTransfer */ }
}

function onQueueDragOver(index) {
  if (dragIndex.value < 0) return
  dropIndex.value = index
}

function onQueueDrop(index) {
  const from = dragIndex.value
  if (from < 0 || from === index) {
    onQueueDragEnd()
    return
  }
  // 优先用 dataTransfer 里的源序号，兼容拖拽期间列表被重新渲染的情况。
  playerStore.moveQueueItem(from, index)
  onQueueDragEnd()
}

function onQueueDragEnd() {
  dragIndex.value = -1
  dropIndex.value = -1
}

/**
 * 交叉淡入淡出只在“原声模式”下启用：那时空间音效占用的第二个媒体元素是空闲的，
 * 借它来播新曲目即可真·重叠；处理链路开启时不做，避免与空间/均衡抢元素。
 */
let activeAudioName = 'native'
let crossfadeTimers = []
let crossfading = false

function activeAudioElement() {
  if (processedEnabled.value) return spatialAudioRef.value
  return activeAudioName === 'spatial' ? spatialAudioRef.value : audioRef.value
}

function idleAudioElement() {
  if (processedEnabled.value) return null
  return activeAudioName === 'spatial' ? audioRef.value : spatialAudioRef.value
}

function stopCrossfade() {
  for (const timer of crossfadeTimers) clearInterval(timer)
  crossfadeTimers = []
  crossfading = false
}

function fadeVolume(audio, from, to, durationMs, onDone) {
  const target = Math.max(0, Math.min(1, to))
  if (!audio) { onDone?.(); return }
  const start = Math.max(0, Math.min(1, from))
  if (durationMs <= 0 || start === target) {
    audio.volume = target
    onDone?.()
    return
  }
  const steps = Math.max(2, Math.ceil(durationMs / 20))
  let step = 0
  const timer = setInterval(() => {
    step += 1
    const ratio = Math.min(1, step / steps)
    audio.volume = Math.max(0, Math.min(1, start + (target - start) * ratio))
    if (ratio >= 1) {
      clearInterval(timer)
      crossfadeTimers = crossfadeTimers.filter((item) => item !== timer)
      onDone?.()
    }
  }, Math.max(10, Math.round(durationMs / steps)))
  crossfadeTimers.push(timer)
}

function targetVolume() {
  return playerStore.muted ? 0 : Math.max(0, Math.min(1, playerStore.volume))
}

/**
 * 切歌交叉淡入：旧音轨淡出的同时新音轨淡入，淡出结束才停旧音轨。
 * @returns {boolean} 是否走了交叉淡入（false 表示调用方应按普通方式切源）
 */
function startCrossfade(song, resumeAt = 0) {
  const outgoing = activeAudioElement()
  const incoming = idleAudioElement()
  if (!song?.audioUrl || !outgoing || !incoming || processedEnabled.value) return false
  if (playerStore.crossfadeMs <= 0 || !playerStore.playing) return false

  const durationMs = Math.min(playerStore.crossfadeMs, 200)
  const volume = targetVolume()
  stopCrossfade()
  crossfading = true

  incoming.volume = 0
  incoming.muted = false
  incoming.playbackRate = Number(playerStore.playbackRate) || 1
  setAudioSource(incoming, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
  seekAudioWhenReady(incoming, resumeAt)
  safePlay(incoming).catch((error) => {
    // 新音轨起不来就退回普通切源，不能把播放卡住。
    stopCrossfade()
    incoming.pause()
    handlePlayFailure(outgoing, error)
  })

  fadeVolume(incoming, 0, volume, durationMs)
  fadeVolume(outgoing, outgoing.volume, 0, durationMs, () => {
    outgoing.pause()
    outgoing.volume = volume
    crossfading = false
    // 新音轨成为当前播放元素，直到下一次切歌再交换。
    activeAudioName = activeAudioName === 'spatial' ? 'native' : 'spatial'
  })
  return true
}

function ensureSpatialAudioGraph() {
  if (!spatialAudioGraph) {
    spatialAudioGraph = createSpatialAudioGraph(spatialAudioRef.value)
    spatialAudioGraph.setVolume(playerStore.volume)
  }
  return spatialAudioGraph
}

function setAudioSource(audio, audioUrl, { anonymous = false } = {}) {
  if (!audio) return
  const previousCorsMode = audio.getAttribute('crossorigin')
  const previousReferrerPolicy = audio.getAttribute('referrerpolicy')
  if (anonymous) {
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('referrerpolicy', 'no-referrer')
  } else {
    audio.removeAttribute('crossorigin')
    audio.removeAttribute('referrerpolicy')
  }
  const corsModeChanged = previousCorsMode !== audio.getAttribute('crossorigin') ||
    previousReferrerPolicy !== audio.getAttribute('referrerpolicy')
  if (!audioUrl) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    return
  }
  let resolvedUrl = audioUrl
  try {
    resolvedUrl = new URL(audioUrl, window.location.href).href
  } catch {
    // Let the media element emit its normal error for malformed source URLs.
  }
  if (audio.src !== resolvedUrl || corsModeChanged) audio.src = audioUrl
}

function seekAudioWhenReady(audio, time) {
  if (!audio || !Number.isFinite(time) || time < 0) return
  const sourceAtRequest = audio.src
  const seek = () => {
    if (audio.src !== sourceAtRequest) return
    try {
      audio.currentTime = time
    } catch {
      // Metadata may not expose a seekable range yet; playback will continue from the start.
    }
  }
  if (audio.readyState >= 1) seek()
  else audio.addEventListener('loadedmetadata', seek, { once: true })
}

function clearSleepClock() {
  if (sleepClockInterval === null || typeof window === 'undefined') return
  window.clearInterval(sleepClockInterval)
  sleepClockInterval = null
}

watch(() => playerStore.sleepTimerEndAt, (endAt) => {
  clearSleepClock()
  if (!endAt || typeof window === 'undefined') return
  sleepClockNow.value = Date.now()
  sleepClockInterval = window.setInterval(() => {
    sleepClockNow.value = Date.now()
    playerStore.checkSleepTimer()
  }, 1000)
}, { immediate: true })

watch(() => playerStore.sleepTimerLastFinishedAt, (finishedAt, previous) => {
  if (finishedAt && finishedAt !== previous) ElMessage.info('睡眠定时结束，播放已暂停')
})

/** 加载收藏 id 集合 */
async function loadFavorites() {
  if (!userStore.isLogin) {
    favoriteIds.value = []
    playerStore.setFavoriteIds([])
    return
  }
  try {
    favoriteIds.value = await favoriteApi.ids()
  } catch (e) {
    favoriteIds.value = []
  }
  // 心动模式按收藏加权，收藏 id 交给 store（不持久化，属于账号数据）。
  playerStore.setFavoriteIds(favoriteIds.value)
}

async function toggleFavorite() {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再收藏')
    return
  }
  const song = currentSong.value
  if (!song || song.isLocal || song.isCustomSource) return
  try {
    if (isFav.value) {
      await favoriteApi.cancel(song.id)
      favoriteIds.value = favoriteIds.value.filter((id) => id !== song.id)
      ElMessage.success('已取消收藏')
    } else {
      await favoriteApi.add(song.id)
      favoriteIds.value.push(song.id)
      ElMessage.success('收藏成功')
    }
  } catch (e) {
    // 错误提示已由拦截器统一处理
  }
}

function togglePlay() {
  if (!currentSong.value) return
  playerStore.playing = !playerStore.playing
}

function notifyAdvance(result, direction) {
  Promise.resolve(result).then((status) => {
    if (!status?.blocked) return
    ElMessage.info(direction < 0
      ? '前面的歌曲已设为不喜欢，仍可手动点播'
      : '后面的歌曲已设为不喜欢，仍可手动点播')
  })
}
/** 本机播放统计：手动切走且没听完算一次“跳过”，供心动模式加权使用（只存本地）。 */
function recordManualSkip() {
  const song = currentSong.value
  if (!song || song.isLocal || song.isCustomSource) return
  const duration = Number(playerStore.duration) || 0
  const position = Number(playerStore.currentTime) || 0
  if (duration > 0 && position / duration >= 0.9) return
  playerStore.recordPlayEvent(song.id, 'skipped')
}

function next() {
  recordManualSkip()
  notifyAdvance(playerStore.next(), 1)
}
function prev() {
  // 播放超过 3 秒时「上一首」先回到开头
  if (playerStore.currentTime > 3) {
    seekTo(0)
    return
  }
  recordManualSkip()
  notifyAdvance(playerStore.prev(), -1)
}

function seekTo(time) {
  const audio = activeAudioElement()
  if (audio && playerStore.duration) {
    audio.currentTime = Math.max(0, Math.min(time, playerStore.duration))
    playerStore.currentTime = audio.currentTime
    syncMediaSessionPosition(true)
  }
}

/** 进度条几何换算；拿不到宽度时返回 null，调用方直接放弃这次交互。 */
function ratioFromEvent(event) {
  const track = trackRef.value
  if (!track) return null
  const rect = track.getBoundingClientRect()
  if (!rect.width) return null
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

function timeFromEvent(event) {
  const ratio = ratioFromEvent(event)
  return ratio === null || !playerStore.duration ? null : ratio * playerStore.duration
}

function onProgressPointerDown(event) {
  if (!playerStore.duration || (event.button !== undefined && event.button > 0)) return
  const time = timeFromEvent(event)
  if (time === null) return
  dragging.value = true
  dragTime.value = time
  dragPointerId = event.pointerId
  try { trackRef.value?.setPointerCapture?.(event.pointerId) } catch { /* 旧浏览器没有指针捕获 */ }
  event.preventDefault()
}

function onProgressPointerMove(event) {
  const ratio = ratioFromEvent(event)
  if (ratio === null) return
  if (dragging.value) {
    dragTime.value = ratio * playerStore.duration
    return
  }
  hoverRatio.value = playerStore.duration ? ratio : null
}

function onProgressPointerUp(event) {
  if (!dragging.value) return
  const time = timeFromEvent(event)
  dragging.value = false
  // 拖动结束后浏览器还会补一个 click，避免它把进度再设一次。
  suppressClickSeek = true
  window.setTimeout(() => { suppressClickSeek = false }, 0)
  if (dragPointerId !== null) {
    try { trackRef.value?.releasePointerCapture?.(dragPointerId) } catch { /* 已自动释放 */ }
    dragPointerId = null
  }
  if (time !== null) seekTo(time)
}

function onProgressPointerCancel() {
  if (!dragging.value) return
  dragging.value = false
  if (dragPointerId !== null) {
    try { trackRef.value?.releasePointerCapture?.(dragPointerId) } catch { /* 已自动释放 */ }
    dragPointerId = null
  }
}

function onProgressPointerLeave() {
  if (!dragging.value) hoverRatio.value = null
}

/** 已经缓冲到的比例，拖动时给用户一个“能跳到哪”的参考。 */
function updateBuffered() {
  const audio = activeAudioElement()
  const duration = Number(playerStore.duration) || Number(audio?.duration) || 0
  if (!audio || !duration || !audio.buffered || audio.buffered.length === 0) {
    bufferedPercent.value = 0
    return
  }
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : playerStore.currentTime
  let end = 0
  for (let i = 0; i < audio.buffered.length; i++) {
    if (audio.buffered.start(i) <= current + 0.5 && audio.buffered.end(i) > end) end = audio.buffered.end(i)
  }
  bufferedPercent.value = Math.min(100, Math.max(0, (end / duration) * 100))
}

function onSeek(e) {
  if (suppressClickSeek) return
  const track = trackRef.value
  if (!track || !playerStore.duration) return
  const rect = track.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(ratio * playerStore.duration)
}

function seekByKeyboard(seconds) {
  if (!playerStore.duration) return
  seekTo(playerStore.currentTime + seconds)
}

function syncMediaSessionMetadata(song = currentSong.value) {
  mediaSessionController?.updateMetadata(song, typeof window === 'undefined' ? undefined : window.location.href)
}

function syncMediaSessionPlaybackState() {
  mediaSessionController?.updatePlaybackState(playerStore.playing, hasSong.value)
}

function syncMediaSessionPosition(force = false) {
  if (!mediaSessionController) return
  const now = Date.now()
  if (!force && now - lastMediaSessionPositionAt < 1000) return
  lastMediaSessionPositionAt = now
  const audio = activeAudioElement()
  const duration = Number.isFinite(audio?.duration) && audio.duration > 0
    ? audio.duration
    : playerStore.duration
  const position = Number.isFinite(audio?.currentTime) ? audio.currentTime : playerStore.currentTime
  mediaSessionController.updatePosition({
    duration,
    position,
    playbackRate: audio?.playbackRate || 1
  })
}

function installMediaSession() {
  mediaSessionController = createMediaSessionController({
    navigatorObject: window.navigator,
    MediaMetadataConstructor: window.MediaMetadata,
    actions: {
      play: () => { if (hasSong.value) playerStore.playing = true },
      pause: () => { playerStore.playing = false },
      stop: () => { playerStore.playing = false },
      previoustrack: prev,
      nexttrack: next,
      seekbackward: ({ seekOffset } = {}) => seekByKeyboard(-(Number.isFinite(Number(seekOffset)) ? Number(seekOffset) : 10)),
      seekforward: ({ seekOffset } = {}) => seekByKeyboard(Number.isFinite(Number(seekOffset)) ? Number(seekOffset) : 10),
      seekto: ({ seekTime } = {}) => {
        if (Number.isFinite(Number(seekTime))) seekTo(Number(seekTime))
      }
    }
  })
  syncMediaSessionMetadata()
  syncMediaSessionPlaybackState()
  syncMediaSessionPosition(true)
}

function onProgressKeydown(event) {
  if (event.shiftKey) {
    if (event.key === 'ArrowLeft') prev()
    else if (event.key === 'ArrowRight') next()
    return
  }
  // 左右 5 秒，上下 10 秒；Home/End 与 PageUp/PageDown 已在模板里单独绑定。
  const step = event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 10 : 5
  const backward = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  seekByKeyboard(backward ? -step : step)
}

/** 全局播放器快捷键；跳过输入框、按钮和滑块，避免干扰正常编辑操作 */
function onPlayerShortcut(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.repeat && (event.code === 'Space' || ['l', 'q'].includes(event.key.toLowerCase()))) return
  const target = event.target
  if (target?.isContentEditable || target?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="slider"], .el-select')) return

  if (event.code === 'Space' || event.key === ' ') {
    if (!hasSong.value) return
    event.preventDefault()
    togglePlay()
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (!hasSong.value) return
    event.preventDefault()
    if (event.shiftKey) {
      event.key === 'ArrowLeft' ? prev() : next()
    } else {
      seekByKeyboard(event.key === 'ArrowLeft' ? -5 : 5)
    }
    return
  }
  if (event.shiftKey) return
  if (event.key.toLowerCase() === 'm') {
    event.preventDefault()
    toggleMute()
    return
  }
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey === false) {
    event.preventDefault()
    playerStore.setVolume(Math.max(0, Math.min(1, playerStore.volume + (event.key === 'ArrowUp' ? 0.05 : -0.05))))
    return
  }
  if (event.key === 'Escape' && viewMode.value === 'stage') {
    event.preventDefault()
    playerStore.setPlayerViewMode('standard')
    return
  }
  if (event.key.toLowerCase() === 'l' && hasSong.value) {
    event.preventDefault()
    toggleLyric()
  } else if (event.key.toLowerCase() === 'q') {
    event.preventDefault()
    queueVisible.value = !queueVisible.value
  } else if (event.key.toLowerCase() === 'v') {
    event.preventDefault()
    cycleViewMode()
  }
}

function onVolume(val) {
  playerStore.setVolume(val / 100)
}

/** 音量区滚轮调节；静音时不动音量，先取消静音再说。 */
function onVolumeWheel(event) {
  if (playerStore.muted) return
  const step = event.deltaY > 0 ? -0.05 : 0.05
  playerStore.setVolume(Math.max(0, Math.min(1, playerStore.volume + step)))
}

function toggleMute() {
  if (playerStore.toggleMuted()) {
    ElMessage.info(playerStore.muted ? '已静音' : `已取消静音，音量 ${volumePercent.value}%`)
  }
}

/** 音量/静音/倍速统一下发到两个媒体元素与空间音效图。 */
function syncAudioOutput({ skipCrossfade = false } = {}) {
  const volume = playerStore.volume
  const rate = Number(playerStore.playbackRate) || 1
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  // 响度补偿：原声模式只能缩放元素音量，处理链路里交给增益节点。
  const gain = currentLoudnessGain.value
  const nativeVolume = applyGainToVolume(volume, gain)
  // 交叉淡入期间音量由淡变器接管，这里不能抢，否则会把淡入/淡出的音量曲线打乱。
  if (!crossfading || !skipCrossfade) {
    if (nativeAudio) {
      nativeAudio.volume = nativeVolume
      nativeAudio.muted = playerStore.muted
      nativeAudio.playbackRate = rate
    }
    if (spatialAudio && !processedEnabled.value) {
      spatialAudio.volume = nativeVolume
      spatialAudio.muted = playerStore.muted
      spatialAudio.playbackRate = rate
    }
  }
  if (spatialAudio && processedEnabled.value) {
    // 空间音效的音量由 WebAudio 图控制，媒体元素本身保持 1。
    spatialAudio.volume = 1
    spatialAudio.muted = false
    spatialAudio.playbackRate = rate
  }
  spatialAudioGraph?.setVolume(playerStore.muted ? 0 : volume)
  spatialAudioGraph?.setLoudness({
    enabled: loudnessStore.enabled,
    trim: loudnessStore.enabled ? gain : 1
  })
}

function cycleRate() {
  const next = playerStore.cyclePlaybackRate()
  syncAudioOutput()
  syncMediaSessionPosition(true)
  ElMessage.info(`播放速度 ${next}×`)
}

/** 部分实现（含 jsdom 与老旧内核）的 play() 不返回 Promise，统一包一层再链式处理。 */
function safePlay(audio) {
  try {
    return Promise.resolve(audio?.play())
  } catch (error) {
    return Promise.reject(error)
  }
}

function handlePlayFailure(audio, error) {
  if (audio !== activeAudioElement()) return
  playerStore.playing = false
  if (error?.name === 'NotAllowedError') {
    ElMessage.warning('浏览器拦截了自动播放，请再点一次播放按钮')
  }
}

/** 统一的 play()：区分“浏览器拦截自动播放”和真正的加载失败。 */
function playActiveAudio(audio) {
  if (!audio) return
  resumeSpatialAudio()
  safePlay(audio).catch((error) => handlePlayFailure(audio, error))
}

/**
 * 重新拉取同一个地址：光把 src 再赋一遍浏览器不会重新请求，必须显式 load()。
 * （手动重试与自动重试都走这里，避免两处各写一套。）
 */
function reloadAudio(audio, song) {
  if (!audio || !song?.audioUrl) return
  setAudioSource(audio, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
  try {
    audio.load()
  } catch {
    // jsdom 等环境没有实现 load()，重试的逻辑不依赖它。
  }
}

/** 自动重试的状态：按曲目记次数，切歌即清零。 */
const autoRetry = { timer: null, attempts: 0, songId: null, wasPlaying: false, notified: false }

function cancelAutoRetry() {
  if (autoRetry.timer !== null) {
    clearTimeout(autoRetry.timer)
    autoRetry.timer = null
  }
}

function resetAutoRetry() {
  cancelAutoRetry()
  autoRetry.attempts = 0
  autoRetry.songId = null
  autoRetry.wasPlaying = false
  autoRetry.notified = false
}

function runAutoRetry(song) {
  autoRetry.timer = null
  if (!song || currentSong.value?.id !== song.id) return
  const audio = activeAudioElement()
  if (!audio || !song.audioUrl) return
  audioError.value = false
  buffering.value = true
  reloadAudio(audio, song)
  seekAudioWhenReady(audio, playerStore.currentTime)
  if (autoRetry.wasPlaying) playActiveAudio(audio)
}

/** 失败后安排一次自动重试。返回 true 表示已经接管（这次先不弹错误提示）。 */
function scheduleAutoRetry(song, code, { message = '音频加载中断，正在自动重试…' } = {}) {
  if (!song?.audioUrl || !isTransientAudioError(code)) return false
  const delay = nextRetryDelay(autoRetry.attempts + 1)
  if (delay === null) return false
  autoRetry.attempts += 1
  autoRetry.songId = song.id
  cancelAutoRetry()
  autoRetry.timer = setTimeout(() => runAutoRetry(song), delay)
  if (!autoRetry.notified) {
    autoRetry.notified = true
    ElMessage.info(message)
  }
  buffering.value = true
  return true
}

/**
 * 下一首元数据预取：用一个游离的媒体元素把下一首的连接与元数据提前预热，
 * 切歌时少等一次握手。不与播放用的两个元素、也不与交叉淡入抢资源。
 */
let preloadAudio = null

function releasePreloadAudio() {
  if (!preloadAudio) return
  try {
    preloadAudio.removeAttribute('src')
    preloadAudio.load()
  } catch {
    // jsdom 等环境没有实现 load()，预取本身只是优化。
  }
  preloadAudio = null
}

function preloadNextTrack() {
  releasePreloadAudio()
  const index = nextPreloadIndex(playerStore.queue, playerStore.currentIndex, playerStore.mode)
  if (index < 0) return
  const next = playerStore.queue[index]
  if (!next?.audioUrl) return
  // 相对地址要按当前页面解析：同源的 /audio/x.wav 同样是远端请求。
  let isRemote = false
  try {
    const resolved = new URL(next.audioUrl, window.location.href)
    isRemote = resolved.protocol === 'http:' || resolved.protocol === 'https:'
  } catch {
    isRemote = false
  }
  const connection = navigator?.connection
  if (!shouldPreloadNext({
    hasNext: true,
    isRemote,
    isLocal: Boolean(next.isLocal),
    isCustomSource: Boolean(next.isCustomSource),
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType
  })) return
  try {
    const AudioConstructor = window.Audio
    if (typeof AudioConstructor !== 'function') return
    preloadAudio = new AudioConstructor()
    preloadAudio.preload = 'metadata'
    preloadAudio.src = next.audioUrl
  } catch {
    preloadAudio = null
  }
}

watch(
  () => [playerStore.currentIndex, playerStore.queue.length, playerStore.mode],
  () => preloadNextTrack()
)

/**
 * 缓冲卡死的兜底：浏览器在连接中断时常常既不报错也不前进，
 * 只留一个转圈的 buffering。检测到长时间没有进展就当成一次网络中断重新加载。
 */
const STALL_CHECK_INTERVAL_MS = 2000
let stallCheckTimer = null
let stallSince = 0
let lastProgressTime = 0

function startStallWatch() {
  if (stallCheckTimer !== null) return
  lastProgressTime = activeAudioElement()?.currentTime || 0
  stallSince = 0
  stallCheckTimer = setInterval(checkPlaybackStall, STALL_CHECK_INTERVAL_MS)
}

function stopStallWatch() {
  if (stallCheckTimer !== null) {
    clearInterval(stallCheckTimer)
    stallCheckTimer = null
  }
  stallSince = 0
}

function checkPlaybackStall() {
  const audio = activeAudioElement()
  const song = currentSong.value
  // 没有播放意图、还没拿到元数据、正在拖动进度、或已经播完：都不算卡死。
  if (!playerStore.playing || !audio || audio.paused || audio.ended) {
    stallSince = 0
    lastProgressTime = audio?.currentTime || 0
    return
  }
  if (dragging.value || audio.readyState < 1) {
    stallSince = 0
    return
  }
  if (hasProgress(lastProgressTime, audio.currentTime)) {
    lastProgressTime = audio.currentTime
    stallSince = 0
    return
  }
  const now = Date.now()
  if (!stallSince) {
    stallSince = now
    return
  }
  if (!isPlaybackStalled({ stalledSince: stallSince, now })) return
  stallSince = 0
  recoverFromStall(song)
}

/** 卡死恢复：跟加载失败共用三次退避的账本，用完才把错误交给用户。 */
function recoverFromStall(song) {
  if (!song) return
  const scheduled = scheduleAutoRetry(song, MEDIA_ERR_NETWORK, { message: '缓冲卡住了，正在重新连接…' })
  if (scheduled) {
    autoRetry.wasPlaying = true
    return
  }
  audioError.value = true
  buffering.value = false
  ElMessage.warning(`《${song.title}》缓冲卡住了，可点播放器上的重试按钮再试一次`)
}

function retryAudio() {
  const song = currentSong.value
  const audio = activeAudioElement()
  if (!song?.audioUrl || !audio) return
  // 用户手动重试：清空自动重试的账本，重新给满三次机会。
  resetAutoRetry()
  audioError.value = false
  offlineFallbackAttempted.value = null
  reloadAudio(audio, song)
  seekAudioWhenReady(audio, playerStore.currentTime)
  if (playerStore.playing) playActiveAudio(audio)
}

function downloadCurrent() {
  const song = currentSong.value
  if (!song?.audioUrl) return
  const created = downloadStore.enqueue({ song, title: song.title, url: song.audioUrl })
  if (created?.length) ElMessage.success(`《${song.title}》已加入下载队列`)
  else ElMessage.warning(downloadStore.statusMessage || '这首歌暂时无法下载')
}

async function toggleDislikeCurrent() {
  const song = currentSong.value
  if (!canDislikeCurrent.value) return
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再设置不喜欢')
    return
  }
  const wasDisliked = currentDisliked.value
  try {
    if (wasDisliked) {
      await dislikeStore.removeSong(song.id)
      ElMessage.success('已移出不喜欢，之后不再跳过')
    } else {
      await dislikeStore.addSong({ id: song.id, title: song.title, singerId: song.singerId, singerName: song.singerName, cover: song.cover })
      ElMessage.success('已加入不喜欢，播放时会自动跳过')
    }
  } catch {
    // 错误提示由拦截器统一处理
  }
}

function shuffleQueue() {
  if (playerStore.shuffleQueue()) ElMessage.success('已随机重排，正在播放的曲目保持不变')
}

function dedupeQueue() {
  const removed = playerStore.dedupeQueue()
  if (removed > 0) ElMessage.success(`已移除 ${removed} 首重复曲目`)
  else ElMessage.info('队列里没有重复曲目')
}

function setQueueItemRef(element, isCurrent) {
  if (isCurrent) queueCurrentItemRef.value = element
}

function scrollQueueToCurrent() {
  queueCurrentItemRef.value?.scrollIntoView?.({ block: 'center' })
}

/** 用户手势时间戳：自动套用空间音效必须在手势之后，否则 AudioContext 会被自动播放策略挡住。 */
let lastUserGestureAt = 0
/** 自动套用只针对同一首歌尝试一次，避免每次切歌失败都弹提示。 */
let spatialAutoTriedFor = ''

function markUserGesture() {
  lastUserGestureAt = Date.now()
}

function hadRecentUserGesture(windowMs = 1500) {
  return Date.now() - lastUserGestureAt < windowMs
}

/** 浏览器挂起音频上下文后（后台标签页/休眠），恢复播放前必须重新 resume，否则只有画面在走、声音是静的。 */
function resumeSpatialAudio() {
  if (!processedEnabled.value || !spatialAudioGraph) return
  const resumed = spatialAudioGraph.resume?.()
  resumed?.catch?.(() => {})
  return resumed
}

/**
 * 自动 resume 也可能失败（系统休眠、策略限制），这时进度在走但没有声音。
 * 与其让用户自己发现，不如在播放条上给一个可见的重试入口。
 */
const audioContextStalled = ref(false)

function refreshAudioContextState() {
  audioContextStalled.value = Boolean(
    processedEnabled.value && spatialAudioGraph && spatialAudioGraph.state !== 'running'
  )
  return audioContextStalled.value
}

async function retryAudioContext() {
  if (!processedEnabled.value || !spatialAudioGraph) return
  const resumed = await Promise.resolve(spatialAudioGraph.resume?.()).catch(() => false)
  syncAudioOutput()
  if (refreshAudioContextState()) {
    ElMessage.warning('浏览器仍然挂起了音频上下文，点一下页面任意位置后再重试')
    return
  }
  if (resumed) ElMessage.success('音频处理链路已恢复')
}

function canUseSpatialAudio(song = currentSong.value) {
  return !explainAudioProcessingBlocker(song, { origin: window.location.href })
}

/**
 * 记住的空间音效偏好在用户手势触发播放时自动套用。
 * 失败时只关掉本次会话，不清除偏好：换一首可用的歌还会再试。
 */
async function applyRememberedSpatialAudio() {
  if (!playerStore.spatialPreferred || spatialEnabled.value) return
  // 均衡器也需要链路：没有空间偏好时，若均衡器非原声同样值得自动接入。
  if (!playerStore.equalizerActive && !playerStore.spatialPreferred) return
  if (!hadRecentUserGesture() || !canUseSpatialAudio()) return
  const song = currentSong.value
  const key = `${song?.id || ''}|${song?.audioUrl || ''}`
  if (spatialAutoTriedFor === key) return
  spatialAutoTriedFor = key
  await toggleSpatialAudio({ silent: true })
}

/** 进入处理链路前先收尾交叉淡入：它占用的正是链路要用的那个媒体元素。 */
function prepareProcessedAudio() {
  stopCrossfade()
  const idle = idleAudioElement()
  if (idle) {
    idle.pause()
    setAudioSource(idle, '')
  }
  activeAudioName = 'native'
}

/**
 * 把播放切换到 Web Audio 处理链路（独立的媒体元素 + 音频图）。
 * 空间音效与均衡器都要经过这条链路；跨域音源不进 Web Audio，保持原声。
 */
async function enableProcessedAudio({ spatial = false, silent = false } = {}) {
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  const song = currentSong.value
  if (!nativeAudio || !spatialAudio || !song?.audioUrl || song.isCustomSource) return false
  if (!isSpatialAudioUrl(song.audioUrl, window.location.href)) {
    // 音源本身不支持：不改写偏好，换一首同源的歌仍然会按偏好自动套用。
    if (!silent) ElMessage.warning('当前音源不经过音频处理链路，空间音效与均衡器不可用')
    return false
  }

  prepareProcessedAudio()
  try {
    const graph = ensureSpatialAudioGraph()
    const resumeAt = nativeAudio.currentTime || playerStore.currentTime
    playerStore.currentTime = resumeAt
    setAudioSource(spatialAudio, song.audioUrl)
    seekAudioWhenReady(spatialAudio, resumeAt)
    spatialAudio.volume = 1
    await graph.context.resume()
    graph.setVolume(playerStore.muted ? 0 : playerStore.volume)
    graph.setEnabled(spatial)
    graph.setEqualizer?.(playerStore.equalizerGains)
    processedEnabled.value = true
    spatialEnabled.value = spatial
    if (spatial) playerStore.setSpatialPreferred(true)
    nativeAudio.pause()
    if (playerStore.playing) {
      try {
        await safePlay(spatialAudio)
      } catch (error) {
        processedEnabled.value = false
        spatialEnabled.value = false
        graph.setEnabled(false)
        setAudioSource(nativeAudio, song.audioUrl)
        seekAudioWhenReady(nativeAudio, resumeAt)
        await safePlay(nativeAudio).catch(() => { playerStore.playing = false })
        throw error
      }
    }
    return true
  } catch {
    spatialAudio.pause()
    spatialAudioGraph?.setEnabled(false)
    processedEnabled.value = false
    spatialEnabled.value = false
    // 启动失败（浏览器不支持/上下文被拒）不改写偏好，下次遇到可用环境再试。
    if (!silent) ElMessage.warning('音频处理链路无法启动，已保持原声播放')
    return false
  }
}

/** 退出处理链路：切回原生媒体元素，保持进度。 */
function disableProcessedAudio({ silent = false, message = '' } = {}) {
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  const song = currentSong.value
  if (spatialAudio) spatialAudio.pause()
  spatialAudioGraph?.setEnabled(false)
  spatialEnabled.value = false
  processedEnabled.value = false
  if (!nativeAudio) return
  const resumeAt = spatialAudio?.currentTime || playerStore.currentTime
  playerStore.currentTime = resumeAt
  setAudioSource(nativeAudio, song?.audioUrl || '', { anonymous: Boolean(song?.isCustomSource) })
  if (song?.audioUrl) seekAudioWhenReady(nativeAudio, resumeAt)
  if (nativeAudio.readyState >= 1 && resumeAt > 0) {
    try { nativeAudio.currentTime = resumeAt } catch { /* wait for metadata */ }
  }
  if (playerStore.playing) safePlay(nativeAudio).catch(() => { playerStore.playing = false })
  if (!silent && message) ElMessage.info(message)
}

function toggleSpatialAudio(options = {}) {
  if (spatialEnabled.value) {
    // 还有均衡器在用时不能直接退出链路，只关掉 3D 支路。
    if (playerStore.equalizerActive) {
      spatialAudioGraph?.setEnabled(false)
      spatialEnabled.value = false
      playerStore.setSpatialPreferred(false)
      if (options.silent !== true) ElMessage.info('已关闭 3D 空间音效（均衡器仍在处理链路中）')
      return Promise.resolve(true)
    }
    disableProcessedAudio({
      silent: options.silent === true,
      message: '已关闭 3D 空间音效，切回原声播放'
    })
    playerStore.setSpatialPreferred(false)
    return Promise.resolve(true)
  }
  return enableProcessedAudio({ spatial: true, silent: options.silent === true })
}

/** 均衡器变化：链路已接入就只改增益，否则按需接入（只处理同源/本地音频）。 */
async function syncEqualizer({ notify = false } = {}) {
  const gains = playerStore.equalizerGains
  const flat = gains.every((value) => Math.abs(value) < 0.01)
  if (!processedEnabled.value) {
    if (flat) return false
    const ok = await enableProcessedAudio({ spatial: spatialEnabled.value, silent: !notify })
    if (!ok && notify) ElMessage.warning(processingBlocker.value || '当前音源不经过音频处理链路，均衡器不可用')
    return ok
  }
  const applied = Boolean(spatialAudioGraph?.setEqualizer?.(gains))
  if (!applied && notify) ElMessage.warning('当前浏览器不支持均衡器')
  return applied
}

function startSleepTimer(minutes) {
  if (!playerStore.setSleepTimerMinutes(minutes)) return
  sleepTimerVisible.value = false
  ElMessage.success(`${minutes} 分钟后暂停播放`)
}

function stopAfterCurrentSong() {
  if (!playerStore.setStopAfterCurrentSong()) return
  sleepTimerVisible.value = false
  ElMessage.success('本曲结束后停止，不会自动播放下一首')
}

function cancelSleepTimer() {
  if (playerStore.cancelSleepTimer()) ElMessage.info('睡眠定时已取消')
}

function toggleLyric() {
  if (!currentSong.value) return
  playerStore.toggleLyric()
}

function openQueue() {
  queueVisible.value = true
}

function openRadio() {
  const song = currentSong.value
  if (!song || song.isLocal || song.isCustomSource) return
  router.push({ path: '/radio', query: { sourceId: song.id } })
}

const canSaveDemoAudio = computed(() => Boolean(
  currentSong.value &&
  !currentSong.value.isLocal &&
  !currentSong.value.isCustomSource &&
  isOwnDemoAudioUrl(currentSong.value.audioUrl, window.location.href)
))

function openLocalFilePicker() {
  localFileInput.value?.click()
}

async function refreshLocalPanels() {
  try {
    rememberedHandles.value = (await listRememberedHandles()).map(({ id, name, addedAt }) => ({ id, name, addedAt }))
  } catch {
    rememberedHandles.value = []
  }
  try {
    cachedDemoAudio.value = await listCachedDemoAudio()
  } catch {
    cachedDemoAudio.value = []
  }
  demoCached.value = canSaveDemoAudio.value
    ? await hasCachedDemoAudio(currentSong.value.audioUrl, window.location.href).catch(() => false)
    : false
}

async function rememberLocalFiles() {
  if (!persistentHandlesSupported) {
    ElMessage.warning('当前浏览器不能记住文件句柄')
    return
  }
  let handles = []
  try {
    handles = await window.showOpenFilePicker({
      multiple: true,
      excludeAcceptAllOption: false,
      types: [{
        description: '音频',
        accept: {
          'audio/*': ['.aac', '.aiff', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm']
        }
      }]
    })
  } catch (error) {
    if (error?.name === 'AbortError') return
    ElMessage.error('没有获得读取这些文件的权限')
    return
  }
  const entries = []
  let remembered = 0
  for (const handle of handles) {
    let file
    try {
      file = await handle.getFile()
    } catch {
      continue
    }
    let handleId = null
    try {
      const saved = await rememberHandle(handle)
      handleId = saved.id
      remembered += 1
    } catch {
      handleId = null
    }
    entries.push({ file, handleId, name: file.name || handle.name || '本地音乐' })
  }
  if (entries.length === 0) {
    ElMessage.warning('没有识别到可播放的音频文件')
    return
  }
  const result = playerStore.addRememberedLocalFiles(entries)
  await refreshLocalPanels()
  if (result.count > 0) {
    await playerStore.playAt(result.startIndex)
    ElMessage.success(remembered > 0
      ? `已记住并播放 ${result.count} 首本地音乐，文件仍只在本机`
      : `已播放 ${result.count} 首本地音乐，但这个浏览器没能记住文件句柄`)
  }
}

async function restoreRememberedFiles() {
  let records = []
  try {
    records = await listRememberedHandles()
  } catch {
    ElMessage.error('无法读取已记住的本地音乐')
    return
  }
  const restored = await filesFromGrantedHandles(records, { requestIfNeeded: true })
  if (restored.files.length === 0) {
    ElMessage.warning(restored.blocked ? '需要重新授权后才能恢复这些文件' : '还没有记住的本地文件')
    return
  }
  const result = playerStore.addRememberedLocalFiles(restored.files)
  if (result.count > 0) {
    await playerStore.playAt(result.startIndex)
    ElMessage.success(`已恢复 ${result.count} 首本地音乐`)
  }
  if (restored.blocked) ElMessage.warning(`${restored.blocked} 个文件没有获得读取权限`)
}

async function forgetHandle(id) {
  await forgetRememberedHandle(id)
  await refreshLocalPanels()
}

/**
 * 删除离线副本会 revoke 掉它的 blob URL；如果当前正好在用这个副本播放，
 * 必须先把音源切回在线地址，否则播放会直接断掉并弹出“加载失败”。
 */
async function restorePlaybackAfterCacheRemoval(path) {
  const song = currentSong.value
  const audio = activeAudioElement()
  if (!song || !audio) return false
  const source = audio.currentSrc || audio.src || ''
  if (!source.startsWith('blob:')) return false
  if (demoAudioPath(song.audioUrl, window.location.href) !== path) return false
  const resumeAt = audio.currentTime || playerStore.currentTime
  const wasPlaying = playerStore.playing
  audio.pause()
  playerStore.currentTime = resumeAt
  setAudioSource(audio, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
  seekAudioWhenReady(audio, resumeAt)
  syncAudioOutput()
  if (wasPlaying) safePlay(audio).catch(() => { playerStore.playing = false })
  ElMessage.info('已删除本机副本，改用在线音频继续播放')
  return true
}

async function toggleDemoCache() {
  const song = currentSong.value
  if (!canSaveDemoAudio.value || !song) return
  try {
    if (demoCached.value) {
      const path = new URL(song.audioUrl, window.location.href).pathname
      await deleteCachedDemoAudio(path)
      demoCached.value = false
      await restorePlaybackAfterCacheRemoval(path)
      ElMessage.success('已删除本机演示副本')
    } else {
      await saveOwnDemoAudio(song, window.location.href)
      demoCached.value = true
      ElMessage.success('已保存本站演示音频，可在队列里删除')
    }
    cachedDemoAudio.value = await listCachedDemoAudio()
  } catch (error) {
    ElMessage.error(error?.message || '演示音频没能保存到本机')
  }
}

async function removeCachedDemo(path) {
  try {
    await deleteCachedDemoAudio(path)
    await refreshLocalPanels()
    await restorePlaybackAfterCacheRemoval(path)
  } catch (error) {
    ElMessage.error(error?.message || '删除离线副本失败')
  }
}

async function onLocalFilesSelected(event) {
  const input = event.target
  const files = Array.from(input?.files || [])
  if (input) input.value = ''
  if (files.length === 0) return

  try {
    const result = playerStore.addLocalFiles(files)
    if (result.count === 0) {
      ElMessage.warning('没有识别到可播放的音频文件')
      return
    }
    await playerStore.playAt(result.startIndex)
    ElMessage.success(`已导入 ${result.count} 首本地音乐，仅在本机浏览器播放`)
    if (result.skipped > 0) ElMessage.warning(`另有 ${result.skipped} 个文件未能导入`)
  } catch {
    ElMessage.error('本地音乐导入失败，请检查文件格式后重试')
  }
}

// ---- 选中的队列歌曲加入已有歌单 ----
const playlistPickerVisible = ref(false)
const myPlaylists = ref([])
const playlistsLoading = ref(false)
const targetPlaylistId = ref('')
const addingToPlaylist = ref(false)

function selectedQueueSongs() {
  return selectedQueueIndices.value.map((index) => playerStore.queue[index]).filter(Boolean)
}

async function openAddSelectedToPlaylist() {
  const picked = selectedQueueSongs()
  if (picked.length === 0) return
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再加入歌单')
    return
  }
  playlistPickerVisible.value = true
  playlistsLoading.value = true
  targetPlaylistId.value = ''
  myPlaylists.value = []
  try {
    const res = await playlistApi.page({ pageNum: 1, pageSize: 50, onlyMine: true })
    myPlaylists.value = res?.records || []
    if (myPlaylists.value.length === 1) targetPlaylistId.value = String(myPlaylists.value[0].id)
  } catch {
    myPlaylists.value = []
    ElMessage.warning('读取歌单失败，请稍后再试')
  } finally {
    playlistsLoading.value = false
  }
}

async function confirmAddSelectedToPlaylist() {
  if (!targetPlaylistId.value || addingToPlaylist.value) return
  const { ids, skipped } = partitionQueueForPlaylist(selectedQueueSongs())
  if (ids.length === 0) {
    ElMessage.warning('所选的都是本地文件或自定义源歌曲，这些不会上传到服务器')
    return
  }
  const target = myPlaylists.value.find((item) => String(item.id) === String(targetPlaylistId.value))
  const targetId = Number(targetPlaylistId.value)
  if (!Number.isInteger(targetId) || targetId <= 0) return
  addingToPlaylist.value = true
  try {
    const added = await playlistApi.addSongs(targetId, ids)
    const summary = describeQueueSaveResult({
      name: target?.name || '',
      requested: ids.length,
      added,
      skippedCount: skipped.length,
      action: '加入'
    })
    ElMessage({ type: summary.type, message: summary.text })
    playlistPickerVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '加入歌单失败，请稍后再试')
  } finally {
    addingToPlaylist.value = false
  }
}

/** 把当前播放队列存成一个新歌单（本地文件与自定义源不会上传）。 */
async function saveQueueAsPlaylist() {
  if (!userStore.isLogin) {
    ElMessage.warning('请先登录后再保存歌单')
    return
  }
  const { ids, skipped } = partitionQueueForPlaylist(playerStore.queue)
  if (ids.length === 0) {
    ElMessage.warning(
      skipped.length > 0
        ? '队列里只有本地文件或自定义源歌曲，这些不会上传到服务器，无法存为歌单'
        : '队列是空的，先添加几首歌吧'
    )
    return
  }
  const hint = skipped.length > 0 ? `${skipped.length} 首本地/自定义源歌曲不会上传，将被跳过。` : ''
  let name = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `将队列里的 ${ids.length} 首歌存入新歌单。${hint}`,
      '存为歌单',
      {
        inputValue: suggestQueuePlaylistName(playerStore.queue),
        inputPlaceholder: '歌单名称',
        inputValidator: (input) => (String(input || '').trim() ? true : '歌单名称不能为空'),
        confirmButtonText: '保存',
        cancelButtonText: '取消'
      }
    )
    name = String(value || '').trim()
  } catch {
    return // 用户取消
  }
  if (!name) return
  try {
    const created = await playlistApi.save({ name })
    const added = await playlistApi.addSongs(created?.id, ids)
    const summary = describeQueueSaveResult({
      name,
      requested: ids.length,
      added,
      skippedCount: skipped.length
    })
    ElMessage({ type: summary.type, message: summary.text })
  } catch (e) {
    ElMessage.error(e?.message || '保存歌单失败，请稍后再试')
  }
}

function clearQueue() {
  playerStore.clearQueue()
  spatialAudioGraph?.setEnabled(false)
  spatialEnabled.value = false
  processedEnabled.value = false
  spatialAutoTriedFor = ''
  for (const audio of [audioRef.value, spatialAudioRef.value]) {
    if (!audio) continue
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}

// ---------- audio 元素与 store 双向同步 ----------
watch(queueVisible, async (open) => {
  if (!open) return
  queueKeyword.value = ''
  clearQueueSelection()
  queueSelectMode.value = false
  await refreshLocalPanels()
  // 打开抽屉时把正在播放的曲目滚到视野里。
  await nextTick()
  scrollQueueToCurrent()
})

watch(currentSong, (song) => {
  resetAutoRetry()
  offlineFallbackAttempted.value = null
  demoCached.value = false
  audioError.value = false
  buffering.value = Boolean(song) && playerStore.playing
  bufferedPercent.value = 0
  hoverRatio.value = null
  dragging.value = false
  if (song && isOwnDemoAudioUrl(song.audioUrl, window.location.href)) {
    hasCachedDemoAudio(song.audioUrl, window.location.href).then((cached) => {
      if (currentSong.value?.id === song.id) demoCached.value = cached
    }).catch(() => {})
  }
  syncMediaSessionMetadata(song)
  syncMediaSessionPlaybackState()
  syncMediaSessionPosition(true)
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  if (!nativeAudio || !spatialAudio) return

  if (!song) {
    spatialAudio.pause()
    nativeAudio.pause()
    setAudioSource(spatialAudio, '')
    setAudioSource(nativeAudio, '')
    spatialEnabled.value = false
    spatialAudioGraph?.setEnabled(false)
    playerStore.duration = 0
    return
  }
  if (!song.audioUrl) {
    spatialAudio.pause()
    nativeAudio.pause()
    setAudioSource(spatialAudio, '')
    setAudioSource(nativeAudio, '')
    spatialEnabled.value = false
    spatialAudioGraph?.setEnabled(false)
    playerStore.playing = false
    playerStore.currentTime = 0
    playerStore.duration = 0
    ElMessage.warning(`《${song.title}》暂无音频地址`)
    return
  }

  if (processedEnabled.value && (song.isCustomSource || !isSpatialAudioUrl(song.audioUrl, window.location.href))) {
    spatialAudio.pause()
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    processedEnabled.value = false
    ElMessage.warning('该音源不经过音频处理链路，已自动切回原声')
  }

  // 交叉淡入：原声模式下用空闲的第二个媒体元素重叠播放，避免切歌爆音与静音间隙。
  const resumedAt = playerStore.currentTime
  if (startCrossfade(song, resumedAt)) {
    syncAudioOutput({ skipCrossfade: true })
  } else if (processedEnabled.value) {
    stopCrossfade()
    nativeAudio.pause()
    setAudioSource(spatialAudio, song.audioUrl)
    seekAudioWhenReady(spatialAudio, resumedAt)
    syncAudioOutput()
  } else {
    stopCrossfade()
    spatialAudio.pause()
    setAudioSource(nativeAudio, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
    seekAudioWhenReady(nativeAudio, resumedAt)
    syncAudioOutput()
  }

  // 断点续播：同一首歌上次听到一半，从记录处继续（过于靠近开头/结尾则不续播）。
  const audio = activeAudioElement()
  const resumeAt = playerStore.consumeResumePosition(song.id, playerStore.duration || song.duration || 0)
  if (resumeAt > 0) {
    playerStore.currentTime = resumeAt
    seekAudioWhenReady(audio, resumeAt)
    ElMessage.info(`已从上一次的 ${fmtDuration(resumeAt)} 继续播放`)
  }

  if (playerStore.playing && audio) playActiveAudio(audio)
})

watch(playing, (isPlaying) => {
  syncMediaSessionPlaybackState()
  syncMediaSessionPosition(true)
  const audio = activeAudioElement()
  if (!audio || !currentSong.value) return
  if (isPlaying) {
    // 恢复播放时按需拉起被挂起的音频上下文，并在用户手势后套用记住的空间音效偏好。
    resumeSpatialAudio()
    applyRememberedSpatialAudio().catch(() => {})
    playActiveAudio(audio)
    startStallWatch()
  } else {
    audio.pause()
    buffering.value = false
    stopStallWatch()
  }
})

watch(
  () => [playerStore.volume, playerStore.muted, playerStore.playbackRate],
  () => {
    if (crossfading) return
    syncAudioOutput()
  }
)

/**
 * 切换曲目时给上一首记一次结果：自然播完已经在 onAudioEnded 记过（guard），
 * 其余都是「中途切走」；听满 90% 以上按听完算，不计跳过。
 */
watch(
  () => currentSong.value?.id,
  (id, previousId) => {
    const outgoing = previousId === undefined || previousId === null ? null : playerStore.queue.find((song) => song?.id === previousId)
    if (outgoing && !statsSkipGuard) {
      const duration = Number(outgoing.duration) || 0
      const ratio = duration > 0 ? statsPosition / duration : 0
      recordStats(ratio >= 0.9 ? 'complete' : 'skip', outgoing, { position: statsPosition })
    }
    statsSkipGuard = false
    statsPosition = 0
    if (id !== undefined && id !== null) recordStats('play', currentSong.value, { position: 0 })
  }
)

function onAudioTimeUpdate(event) {
  const audio = event.currentTarget
  if (audio !== activeAudioElement()) return
  playerStore.currentTime = audio.currentTime
  statsPosition = Number(audio.currentTime) || 0
  playerStore.checkSleepTimer()
  refreshAudioContextState()
  syncMediaSessionPosition()
  updateBuffered()
  // 断点续播：每 5 秒记一次进度，避免频繁写 localStorage。
  const song = currentSong.value
  const now = Date.now()
  if (song && !song.isLocal && !song.isCustomSource && now - resumeSavedAt > 5000) {
    resumeSavedAt = now
    playerStore.saveResumePosition(song.id, audio.currentTime)
    persistSession()
  }
}

function onAudioWaiting(event) {
  if (event.currentTarget !== activeAudioElement()) return
  if (playerStore.playing) buffering.value = true
}

function onAudioPlaying(event) {
  if (event.currentTarget !== activeAudioElement()) return
  buffering.value = false
  audioError.value = false
}

function onAudioCanPlay(event) {
  // 能播了就说明上一次的失败是瞬时的：清空重试账本。
  resetAutoRetry()
  if (event.currentTarget !== activeAudioElement()) return
  buffering.value = false
  updateBuffered()
}

function onAudioProgress(event) {
  if (event.currentTarget !== activeAudioElement()) return
  updateBuffered()
}

function onAudioLoadedMetadata(event) {
  const audio = event.currentTarget
  if (audio !== activeAudioElement()) return
  playerStore.duration = audio.duration || currentSong.value?.duration || 0
  syncMediaSessionPosition(true)
}

function onAudioEnded(event) {
  const audio = event.currentTarget
  if (audio !== activeAudioElement()) return
  const endedSong = currentSong.value
  if (endedSong && !endedSong.isLocal && !endedSong.isCustomSource) {
    playerStore.recordPlayEvent(endedSong.id, 'completed')
  }
  // 自然播完：统计里记 complete，并阻止切歌 watch 再记一次 skip。
  statsSkipGuard = true
  recordStats('complete', endedSong, { position: Number(endedSong?.duration) || statsPosition })
  if (playerStore.checkSleepTimer()) return
  if (playerStore.handleSleepTimerTrackEnd(currentSong.value?.id)) return
  if (playerStore.mode === 'single' && playerStore.priorityNextSongId === null) {
    audio.currentTime = 0
    safePlay(audio).catch(() => {})
    return
  }
  next()
}

function onAudioError(event) {
  if (event.currentTarget !== activeAudioElement()) return
  buffering.value = false
  // 播放失败归因到音源：不记 skip（用户没主动切走），也不算听完。
  statsSkipGuard = true
  if (currentSong.value) recordStats('error', currentSong.value)
  if (event.currentTarget === spatialAudioRef.value && processedEnabled.value) {
    const nativeAudio = audioRef.value
    const spatialAudio = spatialAudioRef.value
    const resumeAt = spatialAudio.currentTime || playerStore.currentTime
    spatialAudio.pause()
    playerStore.currentTime = resumeAt
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    processedEnabled.value = false
    if (currentSong.value?.audioUrl) {
      setAudioSource(nativeAudio, currentSong.value.audioUrl, { anonymous: Boolean(currentSong.value.isCustomSource) })
      seekAudioWhenReady(nativeAudio, resumeAt)
      if (playerStore.playing) {
        safePlay(nativeAudio).catch(() => { playerStore.playing = false })
      }
      ElMessage.warning('音频处理链路遇到播放问题，已自动切回原声')
      return
    }
  }
  const song = currentSong.value
  const errorCode = event.currentTarget?.error?.code ?? event.error?.code
  const canFallback = song && !song.isCustomSource && !song.isLocal && offlineFallbackAttempted.value !== song.id
  if (canFallback) {
    const audio = event.currentTarget
    offlineFallbackAttempted.value = song.id
    objectUrlForCachedDemo(song.audioUrl, window.location.href).then((cachedUrl) => {
      if (!cachedUrl || currentSong.value?.id !== song.id) {
        reportAudioLoadFailure(song, errorCode)
        return
      }
      setAudioSource(audio, cachedUrl)
      if (playerStore.playing) safePlay(audio).catch(() => { playerStore.playing = false })
      ElMessage.info('网络音频不可用，已改用本机保存的演示副本')
    }).catch(() => reportAudioLoadFailure(song, errorCode))
    return
  }
  reportAudioLoadFailure(song, errorCode)
}

function reportAudioLoadFailure(song, code) {
  // 瞬时故障先自动重试（带退避），重试完了还是不行才把错误交给用户。
  const wasPlaying = playerStore.playing
  playerStore.playing = false
  if (scheduleAutoRetry(song, code)) {
    autoRetry.wasPlaying = wasPlaying
    return
  }
  audioError.value = true
  if (song?.isCustomSource) {
    ElMessage.error(`《${song.title}》加载失败：链接可能已过期，或音频站未开放匿名 CORS`)
  } else if (song) {
    ElMessage.error(`《${song.title}》音频加载失败，可点播放器上的重试按钮再试一次`)
  }
}

function onLyricSeek(event) {
  seekTo(event.detail)
}

function onViewportResize() {
  viewportWidth.value = window.innerWidth
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    playerStore.checkSleepTimer()
    // 回到前台：AudioContext 可能已被浏览器挂起，不 resume 就会只走进度不出声。
    resumeSpatialAudio()
    return
  }
  // 切到后台/最小化时把整份队列落盘，回来或下次冷启动都能续播。
  persistSession({ force: true })
  statsStore.flush()
}

onMounted(() => {
  // 交叉淡入会让两个媒体元素轮流当“当前元素”：重新挂载时回到默认，避免状态串台。
  activeAudioName = 'native'
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  if (nativeAudio) {
    nativeAudio.volume = playerStore.volume
    nativeAudio.addEventListener('timeupdate', onAudioTimeUpdate)
    nativeAudio.addEventListener('loadedmetadata', onAudioLoadedMetadata)
    nativeAudio.addEventListener('ended', onAudioEnded)
    nativeAudio.addEventListener('error', onAudioError)
    nativeAudio.addEventListener('waiting', onAudioWaiting)
    nativeAudio.addEventListener('stalled', onAudioWaiting)
    nativeAudio.addEventListener('playing', onAudioPlaying)
    nativeAudio.addEventListener('canplay', onAudioCanPlay)
    nativeAudio.addEventListener('progress', onAudioProgress)
    if (currentSong.value?.audioUrl) {
      setAudioSource(nativeAudio, currentSong.value.audioUrl, { anonymous: Boolean(currentSong.value.isCustomSource) })
      playerStore.duration = currentSong.value.duration || 0
    }
  }
  if (spatialAudio) {
    spatialAudio.volume = 1
    spatialAudio.addEventListener('timeupdate', onAudioTimeUpdate)
    spatialAudio.addEventListener('loadedmetadata', onAudioLoadedMetadata)
    spatialAudio.addEventListener('ended', onAudioEnded)
    spatialAudio.addEventListener('error', onAudioError)
    spatialAudio.addEventListener('waiting', onAudioWaiting)
    spatialAudio.addEventListener('stalled', onAudioWaiting)
    spatialAudio.addEventListener('playing', onAudioPlaying)
    spatialAudio.addEventListener('canplay', onAudioCanPlay)
    spatialAudio.addEventListener('progress', onAudioProgress)
  }
  syncAudioOutput()
  refreshAudioContextState()
  installMediaSession()
  // 均衡器是偏好：等用户手势触发播放时再由 applyRememberedSpatialAudio 一并接入链路。
  if (playerStore.equalizerActive && !playerStore.spatialPreferred) markUserGesture()
  window.addEventListener('mh-seek', onLyricSeek)
  window.addEventListener('keydown', onPlayerShortcut)
  window.addEventListener('keydown', markUserGesture)
  window.addEventListener('pointerdown', markUserGesture)
  window.addEventListener('resize', onViewportResize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  loadFavorites()
  checkSessionResume()
  window.addEventListener('beforeunload', handlePageHide)
})

onUnmounted(() => {
  for (const audio of [audioRef.value, spatialAudioRef.value]) {
    if (!audio) continue
    audio.pause()
    audio.removeEventListener('timeupdate', onAudioTimeUpdate)
    audio.removeEventListener('loadedmetadata', onAudioLoadedMetadata)
    audio.removeEventListener('ended', onAudioEnded)
    audio.removeEventListener('error', onAudioError)
    audio.removeEventListener('waiting', onAudioWaiting)
    audio.removeEventListener('stalled', onAudioWaiting)
    audio.removeEventListener('playing', onAudioPlaying)
    audio.removeEventListener('canplay', onAudioCanPlay)
    audio.removeEventListener('progress', onAudioProgress)
  }
  mediaSessionController?.close()
  mediaSessionController = null
  try {
    const closing = spatialAudioGraph?.close()
    closing?.catch?.(() => {})
  } catch {
    // Cleanup must not interrupt component teardown.
  }
  cancelBarFade()
  // 形态类名加在 <html> 上，组件卸载时清掉，避免留下孤儿状态。
  document.documentElement.classList.remove('mh-player-mini', 'mh-player-dock-left', 'mh-player-dock-right')
  window.removeEventListener('mh-seek', onLyricSeek)
  window.removeEventListener('keydown', onPlayerShortcut)
  window.removeEventListener('keydown', markUserGesture)
  window.removeEventListener('pointerdown', markUserGesture)
  window.removeEventListener('resize', onViewportResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearSleepClock()
  persistSession({ force: true })
  statsStore.flush()
  window.removeEventListener('beforeunload', handlePageHide)
})

// 歌词舞台里手动退出沉浸（Esc / 按钮）时，播放器形态跟着回到标准，避免状态不一致。
watch(() => playerStore.lyricView.immersive, (immersive) => {
  if (playerStore.playerViewMode === 'immersive' && !immersive) {
    openedImmersiveLyric = false
    playerStore.setPlayerViewMode('standard')
  }
})

watch(() => playerStore.equalizerGains.join(','), () => {
  syncEqualizer({ notify: false }).catch(() => {})
})

// 响度补偿跟着曲目与目标档位走：切歌或改档位都重新下发一次。
watch(
  () => [currentLoudnessGain.value, playerStore.currentSong?.id, loudnessStore.target],
  () => {
    // 交叉淡入期间音量归淡变器管，这里插手会把淡入曲线打平。
    if (crossfading) return
    syncAudioOutput()
  }
)

watch(() => playerStore.playerViewMode, (mode) => {
  applyViewMode(mode)
  syncViewportClass(mode)
}, { immediate: true })

watch(() => playerStore.playerBarDock, () => syncViewportClass(playerStore.playerViewMode))

watch(() => userStore.isLogin, (loggedIn) => {
  if (loggedIn) loadFavorites()
  else favoriteIds.value = []
})
</script>

<style scoped>
.player-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--player-h);
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 24px;
  z-index: 100;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-bottom: none;
  background: linear-gradient(180deg, rgba(20, 30, 62, 0.96), rgba(7, 11, 28, 0.94));
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  box-shadow: 0 -18px 50px -34px var(--holo-glow), 0 -1px 0 rgba(255, 255, 255, 0.1) inset;
  transform-style: preserve-3d;
}
/* ---- 会话续播 ---- */
.session-resume {
  position: fixed;
  left: 50%;
  bottom: calc(var(--player-h) + 12px);
  z-index: 1200;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: min(640px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 38%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-elevated, #16171c) 92%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);
}
.session-resume-text {
  font-size: 13px;
  color: var(--text-main);
}
.session-resume-actions {
  display: flex;
  gap: 8px;
}
.session-resume-btn {
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
}
.session-resume-btn.primary {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 74%, transparent);
  border-color: transparent;
}

/* ---- 音频上下文挂起的兜底入口 ---- */
.pb-audio-retry {
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--holo-warning, #f5a623) 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--holo-warning, #f5a623) 14%, transparent);
  color: var(--text-main);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.pb-audio-retry:hover {
  background: color-mix(in srgb, var(--holo-warning, #f5a623) 24%, transparent);
}

/* ---- 响度归一化 ---- */
.loudness-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.loudness-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.loudness-measure {
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}
.loudness-targets {
  display: flex;
  gap: 6px;
}
.loudness-target {
  flex: 1;
  padding: 4px 0;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}
.loudness-target.active {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 62%, transparent);
  border-color: transparent;
}
.loudness-note {
  color: var(--text-sub);
  font-size: 11px;
}

/* ---- 收听统计 ---- */
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stats-row {
  display: flex;
  gap: 12px;
}
.stats-block {
  flex: 1;
}
.stats-label {
  color: var(--text-sub);
  font-size: 11px;
}
.stats-value {
  font-size: 17px;
  font-weight: 600;
  margin: 2px 0;
}
.stats-sub {
  color: var(--text-sub);
  font-size: 11px;
}
.stats-trend {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 78px;
}
.stats-trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stats-trend-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--holo-primary), color-mix(in srgb, var(--holo-primary) 25%, transparent));
}
.stats-trend-day {
  color: var(--text-sub);
  font-size: 10px;
}
.stats-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stats-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.stats-line-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.stats-line-value {
  color: var(--text-sub);
  flex-shrink: 0;
}
.stats-note {
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.5;
}
.stats-clear {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
}

/* ---- 交叉淡入淡出 ---- */
.crossfade-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.crossfade-title {
  font-size: 13px;
  font-weight: 600;
}
.crossfade-options {
  display: flex;
  gap: 6px;
}
.crossfade-option {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
}
.crossfade-option.active {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 62%, transparent);
  border-color: transparent;
}
.crossfade-note {
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.5;
}

/* ---- 贴边停靠与自动隐藏 ---- */
.pb-grip {
  display: grid;
  place-content: center;
  gap: 3px;
  width: 14px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: grab;
  flex-shrink: 0;
  touch-action: none;
}
.pb-grip span {
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-sub);
}
.pb-grip:hover {
  background: rgba(148, 163, 184, 0.16);
}
.player-bar.dock-left,
.player-bar.dock-right {
  left: 12px;
  right: auto;
  bottom: 12px;
  width: min(340px, calc(100vw - 24px));
  height: auto;
  padding: 6px 10px;
  border-radius: 14px;
  border-top: 1px solid var(--border-color);
  box-shadow: 0 18px 44px -26px rgba(0, 0, 0, 0.95), 0 0 0 1px color-mix(in srgb, var(--holo-primary) 12%, transparent) inset;
}
.player-bar.dock-right {
  left: auto;
  right: 12px;
}
.player-bar.dock-left .pb-center,
.player-bar.dock-right .pb-center {
  flex: 1;
  min-width: 0;
}
.player-bar.dock-left .pb-info,
.player-bar.dock-right .pb-info {
  display: none;
}
.player-bar.is-faded {
  opacity: 0.25;
  transition: opacity 0.35s ease;
}
.player-bar.is-faded:hover,
.player-bar.is-faded:focus-within {
  opacity: 1;
}
.dock-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dock-title {
  font-size: 13px;
  font-weight: 600;
}
.dock-options {
  display: flex;
  gap: 6px;
}
.dock-option {
  flex: 1;
  padding: 5px 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
}
.dock-option.active {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 62%, transparent);
  border-color: transparent;
}
.dock-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
}

/* ---- 均衡器 ---- */
.equalizer-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.equalizer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.equalizer-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.equalizer-preset {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}
.equalizer-preset:hover {
  color: var(--holo-primary);
  border-color: color-mix(in srgb, var(--holo-primary) 45%, transparent);
}
.equalizer-preset.active {
  color: #fff;
  background: color-mix(in srgb, var(--holo-primary) 62%, transparent);
  border-color: transparent;
}
.equalizer-bands {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px 10px;
}
.equalizer-band {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--text-sub);
}
.equalizer-slider {
  width: 100%;
  accent-color: var(--holo-primary);
}
.equalizer-value {
  font-variant-numeric: tabular-nums;
}
.equalizer-note.is-blocked {
  color: color-mix(in srgb, var(--holo-danger, #ff6b6b) 85%, var(--text-main));
}
.equalizer-note {
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.5;
}

/* ---- 迷你 / 沉浸形态：只保留核心控制 ---- */
.player-bar.is-compact {
  gap: 12px;
  padding: 0 14px;
}
.player-bar.is-compact .pb-left {
  width: auto;
  max-width: 32%;
  gap: 8px;
  flex-shrink: 0;
}
.player-bar.is-compact .pb-radio,
.player-bar.is-compact .pb-switch,
.player-bar.is-compact .pb-download,
.player-bar.is-compact .pb-dislike,
.player-bar.is-compact .pb-sleep,
.player-bar.is-compact .pb-spatial,
.player-bar.is-compact .pb-volume,
.player-bar.is-compact .pb-volume-value,
.player-bar.is-compact .pb-stats,
.player-bar.is-compact .pb-rate,
.player-bar.is-compact .pb-crossfade,
.player-bar.is-compact .pb-equalizer,
.player-bar.is-compact .pb-shortcuts {
  display: none;
}
.player-bar.is-compact .pb-center {
  padding: 0;
}
.player-bar.is-compact .pb-controls {
  gap: 2px;
}
.player-bar.is-compact .pb-right {
  width: auto;
  justify-content: flex-end;
  gap: 2px;
}
.player-bar.is-compact .pb-holo {
  --holo-size: 40px;
}
.player-bar.is-compact .pb-progress {
  gap: 8px;
}
.player-bar.is-immersive {
  background: linear-gradient(180deg, rgba(20, 30, 62, 0.55), rgba(7, 11, 28, 0.35));
  box-shadow: none;
  border-top-color: color-mix(in srgb, var(--holo-primary) 22%, transparent);
}
.player-bar > audio {
  display: none;
}
.pb-left,
.pb-center,
.pb-right {
  transform: translateZ(12px);
  transform-style: preserve-3d;
}

/* 左侧 */
.pb-left {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 330px;
  min-width: 220px;
}
.pb-left :deep(.el-button) {
  flex-shrink: 0;
}
.pb-holo {
  cursor: pointer;
  line-height: 0;
  transform: translateZ(16px) rotateY(-9deg);
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.4));
}
.pb-holo :deep(.holo) {
  height: calc(var(--sz) * 1.05);
}
.pb-info {
  min-width: 0;
}
.pb-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-artist {
  font-size: 12px;
  color: var(--text-sub);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-fav,
.pb-radio {
  flex-shrink: 0;
}

/* 中间 */
.pb-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.pb-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pb-play {
  width: 42px !important;
  height: 42px !important;
  font-size: 18px;
  color: var(--holo-primary);
  border-color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 12%, transparent);
  box-shadow: 0 8px 20px -10px var(--holo-glow), 0 1px 0 rgba(255, 255, 255, 0.2) inset;
  transform: perspective(500px) translateZ(10px) rotateX(6deg);
}
.pb-play:hover {
  background: color-mix(in srgb, var(--holo-primary) 25%, transparent);
}
.pb-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 560px;
}
.pb-time {
  font-size: 11px;
  color: var(--text-sub);
  width: 38px;
  text-align: center;
  flex-shrink: 0;
}
.progress-track {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.22);
  cursor: pointer;
  position: relative;
  transform: translateZ(7px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) inset, 0 0 10px -7px var(--holo-glow);
  /* 拖动优先：让指针事件落在轨道上而不是被浏览器手势吃掉。 */
  touch-action: none;
}
/* 触摸与大屏都好按：撑出一条透明的扩大点击区。 */
.progress-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -9px;
  bottom: -9px;
}
.progress-track.is-disabled {
  cursor: default;
  opacity: 0.6;
}
.progress-track.is-dragging .progress-inner,
.progress-track.is-dragging {
  transition: none;
}
.progress-track.is-buffering::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, transparent, rgba(148, 226, 255, 0.35), transparent);
  animation: progress-shimmer 1.1s linear infinite;
}
@keyframes progress-shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}
.progress-buffered {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.35);
}
.progress-bubble {
  position: absolute;
  bottom: 14px;
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  color: #041022;
  background: var(--holo-primary);
  pointer-events: none;
  z-index: 2;
}
.progress-inner {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--holo-primary), var(--holo-secondary));
  position: relative;
  transition: width 0.1s linear;
}
.progress-dot {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px var(--holo-primary);
  opacity: 0;
  transition: opacity 0.2s;
}
.progress-track:hover .progress-dot {
  opacity: 1;
}
.progress-track:focus-visible {
  outline: 2px solid var(--holo-primary);
  outline-offset: 5px;
}

/* 右侧 */
.pb-right {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 384px;
  min-width: 300px;
  justify-content: flex-end;
}
.pb-right > * {
  flex-shrink: 0;
}
.pb-volume-group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pb-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 96px;
  color: var(--text-sub);
}
.pb-volume :deep(.el-slider) {
  flex: 1;
}
.pb-volume-value {
  font-size: 11px;
  color: var(--text-sub);
  width: 20px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.pb-rate {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  min-width: 34px;
}
.shortcut-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.shortcut-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-sub, #94a3b8);
}
.shortcut-list kbd {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  color: #0b1220;
  background: rgba(124, 214, 255, 0.85);
}
.shortcut-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-sub, #94a3b8);
}
.pb-rate :deep(span) {
  display: inline-block;
}
.pb-retry {
  color: #ffb4a2;
}
.pb-play.is-buffering {
  color: var(--holo-primary);
}
.spin {
  animation: pb-spin 0.9s linear infinite;
}
@keyframes pb-spin {
  to { transform: rotate(360deg); }
}
.pb-download,
.pb-dislike {
  flex-shrink: 0;
}
.queue-search {
  margin: 0 0 10px;
}
.pb-right .active {
  color: var(--holo-primary);
}
.pb-sleep.active,
.pb-spatial.active {
  color: var(--holo-primary);
  filter: drop-shadow(0 0 7px var(--holo-glow));
}
.sleep-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-main);
}
.sleep-title {
  font-size: 14px;
  font-weight: 700;
}
.sleep-subtitle,
.sleep-note {
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.5;
}
.sleep-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 34%, transparent);
  border-radius: 9px;
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 9%, transparent);
  font-size: 12px;
}
.sleep-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.sleep-options :deep(.el-button),
.sleep-current {
  width: 100%;
  margin: 0;
}
.sleep-cancel {
  align-self: center;
  margin: -6px 0 0;
}

/* 队列抽屉 */
.queue-trigger {
  display: inline-flex;
}
.queue-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.queue-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.local-file-input {
  display: none;
}
.local-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.local-library-row,
.local-library-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.local-library-button,
.local-library-list button {
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.local-library-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.local-library-note {
  margin: 0;
  color: var(--text-sub);
  font-size: 12px;
  line-height: 1.5;
}
.local-library-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.queue-count {
  color: var(--text-sub);
  font-size: 13px;
}
.queue-empty {
  text-align: center;
  color: var(--text-sub);
  padding: 40px 0;
}
.queue-batch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--holo-primary) 22%, var(--border-color));
  background: rgba(148, 163, 184, 0.08);
}
.queue-batch-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.queue-batch-note {
  color: var(--text-sub);
  font-size: 11px;
}
.queue-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--holo-primary);
  cursor: pointer;
}
.queue-item.selected {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--holo-primary) 55%, transparent);
}
.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, box-shadow 0.15s;
  outline: none;
}
.queue-item:hover {
  background: rgba(148, 163, 184, 0.1);
}
.queue-item:focus-visible {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--holo-primary) 70%, transparent);
}
.queue-item.dragging {
  opacity: 0.45;
}
.queue-item.drop-target {
  box-shadow: inset 0 2px 0 0 var(--holo-primary);
}
.queue-hint {
  margin: 8px 0 0;
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.6;
}
.queue-item.active {
  background: color-mix(in srgb, var(--holo-primary) 14%, transparent);
}
.queue-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.queue-meta {
  flex: 1;
  min-width: 0;
}
.queue-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue-item.active .queue-title {
  color: var(--holo-primary);
}
.queue-artist {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-sub);
}
.queue-item-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}
.queue-action-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--text-sub);
  background: transparent;
  cursor: pointer;
}
.queue-action-button:hover:not(:disabled) {
  color: var(--holo-primary);
  background: color-mix(in srgb, var(--holo-primary) 12%, transparent);
}
.queue-action-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.queue-local-tag {
  flex: 0 0 auto;
}

@media (max-width: 900px) {
  .player-bar {
    gap: 12px;
    padding: 0 14px;
  }
  .pb-left {
    min-width: 160px;
    gap: 8px;
  }
  .pb-radio {
    display: none;
  }
  .pb-right {
    width: 320px;
    min-width: 250px;
    gap: 4px;
  }
  .pb-volume {
    width: 80px;
  }
  .pb-volume-value,
  .pb-shortcuts {
    display: none;
  }
  .pb-controls {
    gap: 8px;
  }
}

@media (max-width: 680px) {
  .player-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: 42px 50px;
    gap: 0 8px;
    padding: 6px 12px;
    align-content: center;
  }
  .pb-left {
    grid-column: 1;
    grid-row: 1;
    width: auto;
    min-width: 0;
    gap: 8px;
  }
  .pb-holo {
    display: none;
  }
  .pb-info {
    flex: 1;
  }
  .pb-title {
    font-size: 13px;
  }
  .pb-artist {
    font-size: 10px;
  }
  .pb-fav {
    width: 28px;
    height: 28px;
    padding: 0;
  }
  .pb-download,
  .pb-dislike {
    display: none;
  }
  .pb-center {
    grid-column: 1 / -1;
    grid-row: 2;
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    gap: 8px;
  }
  .pb-controls {
    flex: 0 0 auto;
    gap: 4px;
  }
  .pb-controls :deep(.el-button:not(.pb-play)) {
    width: 28px;
    height: 28px;
    padding: 6px;
  }
  .pb-play {
    width: 36px !important;
    height: 36px !important;
  }
  .pb-progress {
    flex: 1;
    width: auto;
    min-width: 0;
    max-width: none;
    gap: 6px;
  }
  .pb-time {
    width: 32px;
    font-size: 10px;
  }
  .progress-track {
    height: 4px;
  }
  .pb-right {
    grid-column: 2;
    grid-row: 1;
    width: auto;
    min-width: 0;
    gap: 2px;
  }
  .pb-volume {
    width: 80px;
    gap: 4px;
  }
  .pb-volume :deep(.el-slider) {
    width: 54px;
    min-width: 0;
  }
  .pb-right :deep(.el-button) {
    width: 28px;
    height: 28px;
    padding: 6px;
  }
  .pb-rate {
    min-width: 28px;
    padding: 0;
    font-size: 10px;
  }
}

@media (max-width: 380px) {
  .player-bar {
    padding-right: 8px;
    padding-left: 8px;
    column-gap: 5px;
  }
  .pb-right {
    gap: 0;
  }
  .pb-volume {
    width: 68px;
  }
  .pb-rate,
  .pb-mute {
    display: none;
  }
  .pb-volume :deep(.el-slider) {
    width: 42px;
  }
  .pb-controls {
    gap: 2px;
  }
  .pb-controls :deep(.el-button:not(.pb-play)) {
    width: 26px;
    height: 26px;
    padding: 5px;
  }
  .pb-play {
    width: 34px !important;
    height: 34px !important;
  }
  .pb-time {
    width: 28px;
    font-size: 9px;
  }
}
</style>

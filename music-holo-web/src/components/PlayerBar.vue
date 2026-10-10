<template>
  <div class="player-bar glass-panel" :class="{ 'is-compact': isCompactView, 'is-mini': viewMode === 'mini', 'is-immersive': viewMode === 'immersive' }">
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
      <el-tooltip :content="spatialEnabled ? '关闭 3D 空间音效' : '开启 3D 空间音效（本地/同源音源，耳机体验更明显）'" placement="top">
        <el-button
          circle
          text
          class="pb-spatial"
          :class="{ active: spatialEnabled }"
          :disabled="!hasSong || !currentSong?.audioUrl || currentSong?.isCustomSource"
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

  <!-- 播放队列抽屉 -->
  <el-drawer v-model="queueVisible" title="播放队列" :size="queueDrawerSize" append-to-body>
    <div class="queue-toolbar">
      <span class="queue-count">
        共 {{ playerStore.queue.length }} 首<template v-if="playerStore.queueDuration"> · {{ fmtDuration(playerStore.queueDuration) }}</template>
      </span>
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
        <el-button size="small" type="danger" plain :disabled="playerStore.queue.length === 0" @click="clearQueue">
          清空队列
        </el-button>
      </div>
    </div>
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
    <ul v-else class="queue-list" role="listbox" aria-label="播放队列（可拖拽排序、支持键盘操作）">
      <li
        v-for="entry in filteredQueue"
        :key="`${entry.index}-${entry.song.id}`"
        class="queue-item"
        :ref="(element) => setQueueItemRef(element, entry.index === playerStore.currentIndex)"
        :class="{
          active: entry.index === playerStore.currentIndex,
          dragging: dragIndex === entry.index,
          'drop-target': dropIndex === entry.index && dragIndex !== entry.index
        }"
        role="option"
        tabindex="0"
        :aria-selected="entry.index === playerStore.currentIndex ? 'true' : 'false'"
        :aria-label="`第 ${entry.index + 1} 首：${entry.song.title}`"
        :draggable="canDragQueue ? 'true' : 'false'"
        @click="playerStore.playAt(entry.index)"
        @keydown="onQueueItemKeydown($event, entry)"
        @dragstart="onQueueDragStart($event, entry.index)"
        @dragover.prevent="onQueueDragOver(entry.index)"
        @drop.prevent="onQueueDrop(entry.index)"
        @dragend="onQueueDragEnd"
      >
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
import { ElMessage } from 'element-plus'
import { PLAYER_VIEW_MODES, SLEEP_TIMER_MINUTES, usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import { useDislikeStore } from '@/store/dislike'
import { useDownloadStore } from '@/store/downloads'
import * as favoriteApi from '@/api/favorite'
import { fmtDuration } from '@/utils/format'
import { createMediaSessionController } from '@/utils/mediaSession'
import { createSpatialAudioGraph, isSpatialAudioUrl } from '@/utils/spatialAudio'
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
  document.documentElement.classList.toggle('mh-player-mini', mode === 'mini' || mode === 'immersive')
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

function activeAudioElement() {
  return spatialEnabled.value ? spatialAudioRef.value : audioRef.value
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
    return
  }
  try {
    favoriteIds.value = await favoriteApi.ids()
  } catch (e) {
    favoriteIds.value = []
  }
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
function next() {
  notifyAdvance(playerStore.next(), 1)
}
function prev() {
  // 播放超过 3 秒时「上一首」先回到开头
  if (playerStore.currentTime > 3) {
    seekTo(0)
    return
  }
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
function syncAudioOutput() {
  const volume = playerStore.volume
  const rate = Number(playerStore.playbackRate) || 1
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  if (nativeAudio) {
    nativeAudio.volume = volume
    nativeAudio.muted = playerStore.muted
    nativeAudio.playbackRate = rate
  }
  if (spatialAudio) {
    // 空间音效的音量由 WebAudio 图控制，媒体元素本身保持 1。
    spatialAudio.volume = 1
    spatialAudio.muted = false
    spatialAudio.playbackRate = rate
  }
  spatialAudioGraph?.setVolume(playerStore.muted ? 0 : volume)
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

function retryAudio() {
  const song = currentSong.value
  const audio = activeAudioElement()
  if (!song?.audioUrl || !audio) return
  audioError.value = false
  offlineFallbackAttempted.value = null
  setAudioSource(audio, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
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
  if (!spatialEnabled.value || !spatialAudioGraph) return
  const resumed = spatialAudioGraph.resume?.()
  resumed?.catch?.(() => {})
}

function canUseSpatialAudio(song = currentSong.value) {
  return Boolean(song?.audioUrl) && !song.isCustomSource && isSpatialAudioUrl(song.audioUrl, window.location.href)
}

/**
 * 记住的空间音效偏好在用户手势触发播放时自动套用。
 * 失败时只关掉本次会话，不清除偏好：换一首可用的歌还会再试。
 */
async function applyRememberedSpatialAudio() {
  if (!playerStore.spatialPreferred || spatialEnabled.value) return
  if (!hadRecentUserGesture() || !canUseSpatialAudio()) return
  const song = currentSong.value
  const key = `${song?.id || ''}|${song?.audioUrl || ''}`
  if (spatialAutoTriedFor === key) return
  spatialAutoTriedFor = key
  await toggleSpatialAudio({ silent: true })
}

async function toggleSpatialAudio(options = {}) {
  const nativeAudio = audioRef.value
  const spatialAudio = spatialAudioRef.value
  const song = currentSong.value
  if (!nativeAudio || !spatialAudio || !song?.audioUrl || song.isCustomSource) return

  if (spatialEnabled.value) {
    const resumeAt = spatialAudio.currentTime || playerStore.currentTime
    spatialAudio.pause()
    playerStore.currentTime = resumeAt
    setAudioSource(nativeAudio, song.audioUrl)
    seekAudioWhenReady(nativeAudio, resumeAt)
    if (nativeAudio.readyState >= 1 && resumeAt > 0) {
      try { nativeAudio.currentTime = resumeAt } catch { /* wait for metadata */ }
    }
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    if (options.remember !== false) playerStore.setSpatialPreferred(false)
    if (playerStore.playing) {
      safePlay(nativeAudio).catch(() => { playerStore.playing = false })
    }
    if (options.silent !== true) ElMessage.info('已关闭 3D 空间音效，切回原声播放')
    return
  }

  if (!isSpatialAudioUrl(song.audioUrl, window.location.href)) {
    // 音源本身不支持：不改写偏好，换一首同源的歌仍然会按偏好自动套用。
    if (options.silent !== true) ElMessage.warning('该音源不支持空间处理，当前保持原声播放')
    return
  }

  try {
    const graph = ensureSpatialAudioGraph()
    setAudioSource(spatialAudio, song.audioUrl)
    const resumeAt = nativeAudio.currentTime || playerStore.currentTime
    playerStore.currentTime = resumeAt
    seekAudioWhenReady(spatialAudio, resumeAt)
    spatialAudio.volume = 1
    await graph.context.resume()
    graph.setVolume(playerStore.volume)
    graph.setEnabled(true)
    spatialEnabled.value = true
    playerStore.setSpatialPreferred(true)
    nativeAudio.pause()
    if (playerStore.playing) {
      try {
        await safePlay(spatialAudio)
      } catch (error) {
        spatialEnabled.value = false
        graph.setEnabled(false)
        setAudioSource(nativeAudio, song.audioUrl)
        seekAudioWhenReady(nativeAudio, resumeAt)
        await safePlay(nativeAudio).catch(() => { playerStore.playing = false })
        throw error
      }
    }
    if (options.silent !== true) ElMessage.success('已开启 3D 空间音效，使用耳机体验更明显')
  } catch {
    spatialAudio.pause()
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    // 启动失败（浏览器不支持/上下文被拒）不改写偏好，下次遇到可用环境再试。
    if (options.silent !== true) ElMessage.warning('空间音效无法启动，已保持原声播放')
  }
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

function clearQueue() {
  playerStore.clearQueue()
  spatialEnabled.value = false
  spatialAudioGraph?.setEnabled(false)
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
  await refreshLocalPanels()
  // 打开抽屉时把正在播放的曲目滚到视野里。
  await nextTick()
  scrollQueueToCurrent()
})

watch(currentSong, (song) => {
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

  if (spatialEnabled.value && (song.isCustomSource || !isSpatialAudioUrl(song.audioUrl, window.location.href))) {
    spatialAudio.pause()
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    ElMessage.warning('该音源不支持空间处理，已自动切回原声')
  }

  if (spatialEnabled.value) {
    nativeAudio.pause()
    setAudioSource(spatialAudio, song.audioUrl)
    seekAudioWhenReady(spatialAudio, playerStore.currentTime)
  } else {
    spatialAudio.pause()
    setAudioSource(nativeAudio, song.audioUrl, { anonymous: Boolean(song.isCustomSource) })
    seekAudioWhenReady(nativeAudio, playerStore.currentTime)
  }
  syncAudioOutput()

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
  } else {
    audio.pause()
    buffering.value = false
  }
})

watch(
  () => [playerStore.volume, playerStore.muted, playerStore.playbackRate],
  () => syncAudioOutput()
)

function onAudioTimeUpdate(event) {
  const audio = event.currentTarget
  if (audio !== activeAudioElement()) return
  playerStore.currentTime = audio.currentTime
  playerStore.checkSleepTimer()
  syncMediaSessionPosition()
  updateBuffered()
  // 断点续播：每 5 秒记一次进度，避免频繁写 localStorage。
  const song = currentSong.value
  const now = Date.now()
  if (song && !song.isLocal && !song.isCustomSource && now - resumeSavedAt > 5000) {
    resumeSavedAt = now
    playerStore.saveResumePosition(song.id, audio.currentTime)
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
  if (event.currentTarget === spatialAudioRef.value && spatialEnabled.value) {
    const nativeAudio = audioRef.value
    const spatialAudio = spatialAudioRef.value
    const resumeAt = spatialAudio.currentTime || playerStore.currentTime
    spatialAudio.pause()
    playerStore.currentTime = resumeAt
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    if (currentSong.value?.audioUrl) {
      setAudioSource(nativeAudio, currentSong.value.audioUrl, { anonymous: Boolean(currentSong.value.isCustomSource) })
      seekAudioWhenReady(nativeAudio, resumeAt)
      if (playerStore.playing) {
        safePlay(nativeAudio).catch(() => { playerStore.playing = false })
      }
      ElMessage.warning('空间音效遇到播放问题，已自动切回原声')
      return
    }
  }
  const song = currentSong.value
  const canFallback = song && !song.isCustomSource && !song.isLocal && offlineFallbackAttempted.value !== song.id
  if (canFallback) {
    const audio = event.currentTarget
    offlineFallbackAttempted.value = song.id
    objectUrlForCachedDemo(song.audioUrl, window.location.href).then((cachedUrl) => {
      if (!cachedUrl || currentSong.value?.id !== song.id) {
        reportAudioLoadFailure(song)
        return
      }
      setAudioSource(audio, cachedUrl)
      if (playerStore.playing) safePlay(audio).catch(() => { playerStore.playing = false })
      ElMessage.info('网络音频不可用，已改用本机保存的演示副本')
    }).catch(() => reportAudioLoadFailure(song))
    return
  }
  reportAudioLoadFailure(song)
}

function reportAudioLoadFailure(song) {
  audioError.value = true
  if (song?.isCustomSource) {
    ElMessage.error(`《${song.title}》加载失败：链接可能已过期，或音频站未开放匿名 CORS`)
  } else if (song) {
    ElMessage.error(`《${song.title}》音频加载失败，可点播放器上的重试按钮再试一次`)
  }
  playerStore.playing = false
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
  }
}

onMounted(() => {
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
  installMediaSession()
  window.addEventListener('mh-seek', onLyricSeek)
  window.addEventListener('keydown', onPlayerShortcut)
  window.addEventListener('keydown', markUserGesture)
  window.addEventListener('pointerdown', markUserGesture)
  window.addEventListener('resize', onViewportResize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  loadFavorites()
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
  // 形态类名加在 <html> 上，组件卸载时清掉，避免留下孤儿状态。
  document.documentElement.classList.remove('mh-player-mini')
  window.removeEventListener('mh-seek', onLyricSeek)
  window.removeEventListener('keydown', onPlayerShortcut)
  window.removeEventListener('keydown', markUserGesture)
  window.removeEventListener('pointerdown', markUserGesture)
  window.removeEventListener('resize', onViewportResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearSleepClock()
})

// 歌词舞台里手动退出沉浸（Esc / 按钮）时，播放器形态跟着回到标准，避免状态不一致。
watch(() => playerStore.lyricView.immersive, (immersive) => {
  if (playerStore.playerViewMode === 'immersive' && !immersive) {
    openedImmersiveLyric = false
    playerStore.setPlayerViewMode('standard')
  }
})

watch(() => playerStore.playerViewMode, (mode) => {
  applyViewMode(mode)
  syncViewportClass(mode)
}, { immediate: true })

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
.player-bar.is-compact .pb-rate,
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

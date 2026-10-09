<template>
  <div class="player-bar glass-panel">
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
      <el-tooltip :content="isFav ? '取消收藏' : '收藏'" placement="top">
        <el-button
          v-if="currentSong && !currentSong.isLocal && !currentSong.isCustomSource"
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
    </div>

    <!-- 中间：播放控制 + 进度 -->
    <div class="pb-center">
      <div class="pb-controls">
        <el-tooltip content="上一首 · Shift + ←" placement="top">
          <el-button circle :disabled="!hasSong" @click="prev">
            <el-icon><DArrowLeft /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="播放 / 暂停 · 空格" placement="top">
          <el-button class="pb-play" circle :disabled="!hasSong" @click="togglePlay">
            <el-icon v-if="playing"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="下一首 · Shift + →" placement="top">
          <el-button circle :disabled="!hasSong" @click="next">
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
      </div>
      <div class="pb-progress">
        <span class="pb-time">{{ fmtDuration(playerStore.currentTime) }}</span>
        <div
          class="progress-track"
          ref="trackRef"
          role="slider"
          tabindex="0"
          aria-label="播放进度"
          :aria-valuemin="0"
          :aria-valuemax="Math.round(playerStore.duration || 0)"
          :aria-valuenow="Math.round(playerStore.currentTime || 0)"
          :aria-valuetext="`${fmtDuration(playerStore.currentTime)} / ${fmtDuration(playerStore.duration)}`"
          @click="onSeek"
          @keydown.left.prevent="onProgressKeydown"
          @keydown.right.prevent="onProgressKeydown"
          @keydown.home.prevent="seekTo(0)"
          @keydown.end.prevent="seekTo(playerStore.duration)"
        >
          <div class="progress-inner" :style="{ width: progressPercent + '%' }">
            <div class="progress-dot"></div>
          </div>
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
          @click="toggleSpatialAudio"
        >
          <el-icon><Headset /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="音量" placement="top">
        <div class="pb-volume">
          <el-icon><Mic /></el-icon>
          <el-slider v-model="volume" :min="0" :max="100" :show-tooltip="false" @input="onVolume" />
        </div>
      </el-tooltip>
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
    </div>

    <!-- 原声播放器始终保留；空间音效使用独立媒体元素，确保跨域音源可安全回退原声。 -->
    <audio ref="audioRef" preload="auto"></audio>
    <audio ref="spatialAudioRef" preload="none"></audio>
  </div>

  <!-- 播放队列抽屉 -->
  <el-drawer v-model="queueVisible" title="播放队列" :size="queueDrawerSize" append-to-body>
    <div class="queue-toolbar">
      <span class="queue-count">共 {{ playerStore.queue.length }} 首</span>
      <div class="queue-tools">
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
    <div v-if="playerStore.queue.length === 0" class="queue-empty">队列空空如也，点上方“导入本地音乐”选择文件，或去曲库挑几首歌吧～</div>
    <div
      v-for="(song, index) in playerStore.queue"
      :key="song.id"
      class="queue-item"
      :class="{ active: index === playerStore.currentIndex }"
      @click="playerStore.playAt(index)"
    >
      <div class="queue-cover"><Cover :src="song.cover" :text="song.title" :size="36" :anonymous="Boolean(song.isCustomSource)" /></div>
      <div class="queue-meta">
        <div class="queue-title">{{ song.title }}</div>
        <div class="queue-artist">
          {{ song.singerName }}
          <el-tag v-if="song.isLocal" size="small" effect="plain" class="queue-local-tag">本地</el-tag>
          <el-tag v-else-if="song.isCustomSource" size="small" effect="plain" class="queue-local-tag">
            {{ song.sourceName ? `${song.sourceName} · ${song.sourcePlatform || '自定义源'}` : song.sourcePlatform || '自定义源' }}
          </el-tag>
        </div>
      </div>
      <div class="queue-item-actions">
        <button
          type="button"
          class="queue-action-button"
          title="上移一位"
          :disabled="index === 0"
          :aria-label="`上移《${song.title}》`"
          @click.stop="playerStore.moveQueueItem(index, index - 1)"
        >
          <el-icon><ArrowUp /></el-icon>
        </button>
        <button
          type="button"
          class="queue-action-button"
          title="下移一位"
          :disabled="index === playerStore.queue.length - 1"
          :aria-label="`下移《${song.title}》`"
          @click.stop="playerStore.moveQueueItem(index, index + 1)"
        >
          <el-icon><ArrowDown /></el-icon>
        </button>
        <button
          type="button"
          class="queue-action-button"
          title="从队列移除"
          :aria-label="`从播放队列移除《${song.title}》`"
          @click.stop="playerStore.removeAt(index)"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SLEEP_TIMER_MINUTES, usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import * as favoriteApi from '@/api/favorite'
import { fmtDuration } from '@/utils/format'
import { createMediaSessionController } from '@/utils/mediaSession'
import { createSpatialAudioGraph, isSpatialAudioUrl } from '@/utils/spatialAudio'
import HoloProjector from './HoloProjector.vue'
import Cover from './Cover.vue'

const playerStore = usePlayerStore()
const userStore = useUserStore()
const router = useRouter()

const audioRef = ref(null)
const spatialAudioRef = ref(null)
const spatialEnabled = ref(false)
const trackRef = ref(null)
let spatialAudioGraph = null
let mediaSessionController = null
let lastMediaSessionPositionAt = 0
const localFileInput = ref(null)
const queueVisible = ref(false)
const sleepTimerVisible = ref(false)
const sleepClockNow = ref(Date.now())
let sleepClockInterval = null
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const queueDrawerSize = computed(() => viewportWidth.value <= 420 ? '100%' : '380px')
const volume = ref(Math.round(playerStore.volume * 100))
const favoriteIds = ref([])

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
const progressPercent = computed(() => {
  if (!playerStore.duration) return 0
  return Math.min(100, (playerStore.currentTime / playerStore.duration) * 100)
})

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

function next() {
  playerStore.next()
}
function prev() {
  // 播放超过 3 秒时「上一首」先回到开头
  if (playerStore.currentTime > 3) {
    seekTo(0)
    return
  }
  playerStore.prev()
}

function seekTo(time) {
  const audio = activeAudioElement()
  if (audio && playerStore.duration) {
    audio.currentTime = Math.max(0, Math.min(time, playerStore.duration))
    playerStore.currentTime = audio.currentTime
    syncMediaSessionPosition(true)
  }
}

function onSeek(e) {
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
    event.key === 'ArrowLeft' ? prev() : next()
    return
  }
  seekByKeyboard(event.key === 'ArrowLeft' ? -5 : 5)
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
  if (event.key.toLowerCase() === 'l' && hasSong.value) {
    event.preventDefault()
    toggleLyric()
  } else if (event.key.toLowerCase() === 'q') {
    event.preventDefault()
    queueVisible.value = !queueVisible.value
  }
}

function onVolume(val) {
  playerStore.setVolume(val / 100)
}

async function toggleSpatialAudio() {
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
    if (playerStore.playing) {
      nativeAudio.play().catch(() => { playerStore.playing = false })
    }
    ElMessage.info('已关闭 3D 空间音效，切回原声播放')
    return
  }

  if (!isSpatialAudioUrl(song.audioUrl, window.location.href)) {
    ElMessage.warning('该音源不支持空间处理，当前保持原声播放')
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
    nativeAudio.pause()
    if (playerStore.playing) {
      try {
        await spatialAudio.play()
      } catch (error) {
        spatialEnabled.value = false
        graph.setEnabled(false)
        setAudioSource(nativeAudio, song.audioUrl)
        seekAudioWhenReady(nativeAudio, resumeAt)
        await nativeAudio.play().catch(() => { playerStore.playing = false })
        throw error
      }
    }
    ElMessage.success('已开启 3D 空间音效，使用耳机体验更明显')
  } catch {
    spatialAudio.pause()
    spatialAudioGraph?.setEnabled(false)
    spatialEnabled.value = false
    ElMessage.warning('空间音效无法启动，已保持原声播放')
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

function openLocalFilePicker() {
  localFileInput.value?.click()
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
  for (const audio of [audioRef.value, spatialAudioRef.value]) {
    if (!audio) continue
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}

// ---------- audio 元素与 store 双向同步 ----------
watch(currentSong, (song) => {
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

  const audio = activeAudioElement()
  if (playerStore.playing && audio) {
    audio.play().catch(() => {
      if (audio === activeAudioElement()) playerStore.playing = false
    })
  }
})

watch(playing, (isPlaying) => {
  syncMediaSessionPlaybackState()
  syncMediaSessionPosition(true)
  const audio = activeAudioElement()
  if (!audio || !currentSong.value) return
  if (isPlaying) {
    audio.play().catch(() => {
      if (audio === activeAudioElement()) playerStore.playing = false
    })
  } else {
    audio.pause()
  }
})

watch(() => playerStore.volume, (value) => {
  if (audioRef.value) audioRef.value.volume = value
  if (spatialAudioRef.value) spatialAudioRef.value.volume = 1
  spatialAudioGraph?.setVolume(value)
})

function onAudioTimeUpdate(event) {
  const audio = event.currentTarget
  if (audio !== activeAudioElement()) return
  playerStore.currentTime = audio.currentTime
  playerStore.checkSleepTimer()
  syncMediaSessionPosition()
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
    audio.play().catch(() => {})
    return
  }
  playerStore.next()
}

function onAudioError(event) {
  if (event.currentTarget !== activeAudioElement()) return
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
        nativeAudio.play().catch(() => { playerStore.playing = false })
      }
      ElMessage.warning('空间音效遇到播放问题，已自动切回原声')
      return
    }
  }
  if (currentSong.value?.isCustomSource) {
    ElMessage.error(`《${currentSong.value.title}》加载失败：链接可能已过期，或音频站未开放匿名 CORS`)
  } else if (currentSong.value) {
    ElMessage.error(`《${currentSong.value.title}》音频加载失败`)
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
  if (document.visibilityState === 'visible') playerStore.checkSleepTimer()
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
  }
  installMediaSession()
  window.addEventListener('mh-seek', onLyricSeek)
  window.addEventListener('keydown', onPlayerShortcut)
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
  }
  mediaSessionController?.close()
  mediaSessionController = null
  try {
    const closing = spatialAudioGraph?.close()
    closing?.catch?.(() => {})
  } catch {
    // Cleanup must not interrupt component teardown.
  }
  window.removeEventListener('mh-seek', onLyricSeek)
  window.removeEventListener('keydown', onPlayerShortcut)
  window.removeEventListener('resize', onViewportResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearSleepClock()
})

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
  gap: 12px;
  width: 300px;
  min-width: 220px;
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
  gap: 8px;
  width: 280px;
  min-width: 200px;
  justify-content: flex-end;
}
.pb-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 130px;
  color: var(--text-sub);
}
.pb-volume :deep(.el-slider) {
  flex: 1;
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
.queue-count {
  color: var(--text-sub);
  font-size: 13px;
}
.queue-empty {
  text-align: center;
  color: var(--text-sub);
  padding: 40px 0;
}
.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.queue-item:hover {
  background: rgba(148, 163, 184, 0.1);
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
    width: 230px;
    min-width: 158px;
    gap: 4px;
  }
  .pb-volume {
    width: 105px;
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

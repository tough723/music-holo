<template>
  <div class="player-bar glass-panel">
    <!-- 左侧：全息投影 + 歌曲信息 -->
    <div class="pb-left">
      <div class="pb-holo" @click="toggleLyric">
        <HoloProjector
          :cover="currentSong?.cover"
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
          v-if="currentSong"
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
    </div>

    <!-- 中间：播放控制 + 进度 -->
    <div class="pb-center">
      <div class="pb-controls">
        <el-tooltip content="上一首" placement="top">
          <el-button circle :disabled="!hasSong" @click="prev">
            <el-icon><DArrowLeft /></el-icon>
          </el-button>
        </el-tooltip>
        <el-button class="pb-play" circle :disabled="!hasSong" @click="togglePlay">
          <el-icon v-if="playing"><VideoPause /></el-icon>
          <el-icon v-else><VideoPlay /></el-icon>
        </el-button>
        <el-tooltip content="下一首" placement="top">
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
        <div class="progress-track" ref="trackRef" @click="onSeek">
          <div class="progress-inner" :style="{ width: progressPercent + '%' }">
            <div class="progress-dot"></div>
          </div>
        </div>
        <span class="pb-time">{{ fmtDuration(playerStore.duration) }}</span>
      </div>
    </div>

    <!-- 右侧：音量 / 歌词 / 队列 -->
    <div class="pb-right">
      <el-tooltip content="音量" placement="top">
        <div class="pb-volume">
          <el-icon><Mic /></el-icon>
          <el-slider v-model="volume" :min="0" :max="100" :show-tooltip="false" @input="onVolume" />
        </div>
      </el-tooltip>
      <el-tooltip content="歌词" placement="top">
        <el-button circle text :class="{ active: playerStore.lyricVisible }" @click="toggleLyric">
          <el-icon><ChatLineSquare /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip content="播放队列" placement="top">
        <el-badge :value="playerStore.queue.length" :hidden="playerStore.queue.length === 0" type="primary">
          <el-button circle text @click="queueVisible = true">
            <el-icon><List /></el-icon>
          </el-button>
        </el-badge>
      </el-tooltip>
    </div>

    <!-- 隐藏的 audio 元素 -->
    <audio ref="audioRef" preload="auto"></audio>
  </div>

  <!-- 播放队列抽屉 -->
  <el-drawer v-model="queueVisible" title="播放队列" size="380px" append-to-body>
    <div class="queue-toolbar">
      <span class="queue-count">共 {{ playerStore.queue.length }} 首</span>
      <el-button size="small" type="danger" plain :disabled="playerStore.queue.length === 0" @click="clearQueue">
        清空队列
      </el-button>
    </div>
    <div v-if="playerStore.queue.length === 0" class="queue-empty">队列空空如也，去挑几首歌吧～</div>
    <div
      v-for="(song, index) in playerStore.queue"
      :key="song.id"
      class="queue-item"
      :class="{ active: index === playerStore.currentIndex }"
      @click="playerStore.playAt(index)"
    >
      <div class="queue-cover"><Cover :src="song.cover" :text="song.title" :size="36" /></div>
      <div class="queue-meta">
        <div class="queue-title">{{ song.title }}</div>
        <div class="queue-artist">{{ song.singerName }}</div>
      </div>
      <el-button circle size="small" text @click.stop="playerStore.removeAt(index)">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlayerStore } from '@/store/player'
import { useUserStore } from '@/store/user'
import * as favoriteApi from '@/api/favorite'
import { fmtDuration } from '@/utils/format'
import HoloProjector from './HoloProjector.vue'
import Cover from './Cover.vue'

const playerStore = usePlayerStore()
const userStore = useUserStore()

const audioRef = ref(null)
const trackRef = ref(null)
const queueVisible = ref(false)
const volume = ref(Math.round(playerStore.volume * 100))
const favoriteIds = ref([])

const currentSong = computed(() => playerStore.currentSong)
const playing = computed(() => playerStore.playing)
const hasSong = computed(() => !!currentSong.value)
const isFav = computed(() => currentSong.value ? favoriteIds.value.includes(currentSong.value.id) : false)
const progressPercent = computed(() => {
  if (!playerStore.duration) return 0
  return Math.min(100, (playerStore.currentTime / playerStore.duration) * 100)
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
  if (!song) return
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
  const audio = audioRef.value
  if (audio && playerStore.duration) {
    audio.currentTime = Math.max(0, Math.min(time, playerStore.duration))
    playerStore.currentTime = audio.currentTime
  }
}

function onSeek(e) {
  const track = trackRef.value
  if (!track || !playerStore.duration) return
  const rect = track.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(ratio * playerStore.duration)
}

function onVolume(val) {
  playerStore.setVolume(val / 100)
}

function toggleLyric() {
  if (!currentSong.value) return
  playerStore.toggleLyric()
}

function clearQueue() {
  playerStore.clearQueue()
  const audio = audioRef.value
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
  }
}

// ---------- audio 元素与 store 双向同步 ----------
watch(currentSong, (song) => {
  const audio = audioRef.value
  if (!audio) return
  if (!song) {
    audio.pause()
    audio.removeAttribute('src')
    playerStore.duration = 0
    return
  }
  if (!song.audioUrl) {
    ElMessage.warning(`《${song.title}》暂无音频地址`)
    return
  }
  if (audio.src !== song.audioUrl) {
    audio.src = song.audioUrl
  }
  if (playerStore.playing) {
    audio.play().catch(() => {
      playerStore.playing = false
    })
  }
})

watch(playing, (isPlaying) => {
  const audio = audioRef.value
  if (!audio || !currentSong.value) return
  if (isPlaying) {
    audio.play().catch(() => {
      playerStore.playing = false
    })
  } else {
    audio.pause()
  }
})

watch(() => playerStore.volume, (v) => {
  if (audioRef.value) audioRef.value.volume = v
})

onMounted(() => {
  const audio = audioRef.value
  audio.volume = playerStore.volume

  audio.addEventListener('timeupdate', () => {
    playerStore.currentTime = audio.currentTime
  })
  audio.addEventListener('loadedmetadata', () => {
    playerStore.duration = audio.duration || currentSong.value?.duration || 0
  })
  audio.addEventListener('ended', () => {
    if (playerStore.mode === 'single') {
      audio.currentTime = 0
      audio.play().catch(() => {})
      return
    }
    playerStore.next()
  })
  audio.addEventListener('error', () => {
    if (currentSong.value) {
      ElMessage.error(`《${currentSong.value.title}》音频加载失败`)
    }
    playerStore.playing = false
  })

  // 监听歌词面板的跳转事件
  window.addEventListener('mh-seek', (e) => seekTo(e.detail))

  loadFavorites()
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
.pb-fav {
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

/* 队列抽屉 */
.queue-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
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
  font-size: 12px;
  color: var(--text-sub);
}
</style>

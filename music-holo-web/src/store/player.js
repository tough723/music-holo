import { defineStore } from 'pinia'
import * as songApi from '@/api/song'
import * as lyricApi from '@/api/lyric'
import { useDislikeStore } from '@/store/dislike'
import { findAdvanceIndex } from '@/utils/dislikeSkip'

const PLAYER_KEY = 'mh_player'

/** 播放模式 */
export const MODES = [
  { key: 'order', label: '顺序播放' },
  { key: 'loop', label: '列表循环' },
  { key: 'single', label: '单曲循环' },
  { key: 'random', label: '随机播放' }
]

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60]

/** 可选播放速度；只接受这些档位，避免异常倍速把音频解码器拖垮。 */
export const PLAYBACK_RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
/** 短于这个进度不值得续播（大概率只听了片头）。 */
export const RESUME_MIN_SECONDS = 5
/** 距离结尾这么近就从头开始，避免续播后立刻切歌。 */
export const RESUME_TAIL_GUARD_SECONDS = 15

/**
 * 播放器形态：标准（完整播放条）/ 迷你（收成一条，只留核心控制）/ 沉浸（全屏歌词舞台 + 极简条）。
 * 只影响界面布局，不改变播放行为；桌面端可据此调整窗口，Web 端只改浮层形态。
 */
export const PLAYER_VIEW_MODES = Object.freeze([
  { key: 'standard', label: '标准', desc: '完整播放条：全部控件与进度条' },
  { key: 'mini', label: '迷你', desc: '收窄成一条，只留播放控制与进度' },
  { key: 'immersive', label: '沉浸', desc: '全屏歌词舞台 + 极简控制条' }
])
const PLAYER_VIEW_MODE_KEYS = PLAYER_VIEW_MODES.map((mode) => mode.key)

export function normalizePlayerViewMode(value) {
  return PLAYER_VIEW_MODE_KEYS.includes(value) ? value : 'standard'
}

/** 歌词显示偏好：字号档位与缩放系数。 */
export const LYRIC_FONT_SIZES = Object.freeze([
  { key: 'small', label: '小', scale: 0.86 },
  { key: 'medium', label: '中', scale: 1 },
  { key: 'large', label: '大', scale: 1.2 }
])
/** 歌词时间校准：单次步进与上下限（毫秒）。正值＝歌词提前出现。 */
export const LYRIC_OFFSET_STEP_MS = 500
export const LYRIC_OFFSET_LIMIT_MS = 5000

/** 把任意输入收敛成合法的歌词显示偏好。 */
export function normalizeLyricView(saved = {}) {
  const source = saved && typeof saved === 'object' ? saved : {}
  const offset = Number(source.offsetMs)
  return {
    showTranslation: source.showTranslation !== false,
    showRomaji: source.showRomaji === true,
    showVerbatim: source.showVerbatim !== false,
    immersive: source.immersive === true,
    fontSize: LYRIC_FONT_SIZES.some((item) => item.key === source.fontSize) ? source.fontSize : 'medium',
    offsetMs: Number.isFinite(offset)
      ? Math.max(-LYRIC_OFFSET_LIMIT_MS, Math.min(LYRIC_OFFSET_LIMIT_MS, Math.round(offset / 10) * 10))
      : 0
  }
}

const AUDIO_FILE_EXTENSION = /\.(aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|weba|webm)$/i
const sleepTimerHandles = new WeakMap()

/** 把任意输入收敛到受支持的倍速档位。 */
export function normalizePlaybackRate(rate) {
  const value = Number(rate)
  if (!Number.isFinite(value) || value <= 0) return 1
  let closest = PLAYBACK_RATES[0]
  for (const candidate of PLAYBACK_RATES) {
    if (Math.abs(candidate - value) < Math.abs(closest - value)) closest = candidate
  }
  return closest
}

function clearSleepTimerTimeout(store) {
  const handle = sleepTimerHandles.get(store)
  if (handle !== undefined) clearTimeout(handle)
  sleepTimerHandles.delete(store)
}

function scheduleSleepTimerTimeout(store) {
  clearSleepTimerTimeout(store)
  if (store.sleepTimerMode !== 'duration' || !store.sleepTimerEndAt) return

  const expectedEndAt = store.sleepTimerEndAt
  const handle = setTimeout(() => {
    if (sleepTimerHandles.get(store) === handle) sleepTimerHandles.delete(store)
    store.checkSleepTimer()
    if (store.sleepTimerMode === 'duration') scheduleSleepTimerTimeout(store)
  }, Math.max(0, expectedEndAt - Date.now()))
  sleepTimerHandles.set(store, handle)
}

function isAudioFile(file) {
  return file && (file.type?.toLowerCase().startsWith('audio/') || AUDIO_FILE_EXTENSION.test(file.name || ''))
}

function currentDislikeRules() {
  const rules = useDislikeStore()
  return { songIds: rules.songIds, singerIds: rules.singerIds }
}

function afterPlay(playPromise, status) {
  return Promise.resolve(playPromise).then(() => status)
}

function createLocalTrackId() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `local-${id}`
}

function revokeLocalAudio(song) {
  if (!song?.isLocal || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  const url = song.audioUrl
  if (typeof url !== 'string' || !url.startsWith('blob:')) return
  // Let Vue update the <audio> source before releasing its previous object URL.
  Promise.resolve().then(() => URL.revokeObjectURL(url))
}

function releaseLocalSongs(songs, retainedUrls = new Set()) {
  for (const song of songs || []) {
    if (song?.isLocal && !retainedUrls.has(song.audioUrl)) revokeLocalAudio(song)
  }
}

function loadPersisted() {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_KEY) || '{}')
  } catch (e) {
    return {}
  }
}

function persist(state) {
  // Local blobs and custom-source signed URLs are session-only; never persist them.
  const persistentQueue = state.queue.filter((song) => !song?.isLocal && !song?.isCustomSource)
  const currentSong = state.currentIndex >= 0 ? state.queue[state.currentIndex] : null
  const hasTransientCurrent = Boolean(currentSong?.isLocal || currentSong?.isCustomSource)
  const currentIndex = currentSong && !hasTransientCurrent
    ? persistentQueue.findIndex((song) => song.id === currentSong.id)
    : -1
  const priorityNextIndex = state.currentIndex >= 0 ? state.currentIndex + 1 : 0
  const priorityNextSong = state.queue[priorityNextIndex]
  const priorityNextSongId = !hasTransientCurrent &&
    priorityNextSong?.id === state.priorityNextSongId &&
    !priorityNextSong?.isLocal &&
    !priorityNextSong?.isCustomSource
    ? state.priorityNextSongId
    : null

  localStorage.setItem(PLAYER_KEY, JSON.stringify({
    queue: persistentQueue,
    currentIndex,
    priorityNextSongId,
    mode: state.mode,
    volume: state.volume,
    muted: Boolean(state.muted),
    playbackRate: normalizePlaybackRate(state.playbackRate),
    // 断点续播只记曲库歌曲：播放器只在曲目非本地、非自定义源时才写入这两个字段。
    resumeSongId: state.resumeSongId ?? null,
    resumeTime: Math.max(0, Number(state.resumeTime) || 0),
    // 歌词显示偏好（译文/罗马音/逐字/沉浸/字号/时间校准）跨会话保留。
    lyricView: normalizeLyricView(state.lyricView),
    // 空间音效是输出偏好：记住用户上次的开关，下一次用户手势触发播放时自动套用。
    spatialPreferred: Boolean(state.spatialPreferred),
    playerViewMode: normalizePlayerViewMode(state.playerViewMode)
  }))
}

export const usePlayerStore = defineStore('player', {
  state: () => {
    const saved = loadPersisted()
    const persistedQueue = Array.isArray(saved.queue) ? saved.queue : []
    const persistedCurrentSong = Number.isInteger(saved.currentIndex) ? persistedQueue[saved.currentIndex] : null
    const queue = persistedQueue.filter((song) => !song?.isLocal && !song?.isCustomSource)
    const currentIndex = persistedCurrentSong && !persistedCurrentSong.isLocal && !persistedCurrentSong.isCustomSource
      ? queue.findIndex((song) => song.id === persistedCurrentSong.id)
      : -1
    const priorityNextIndex = currentIndex >= 0 ? currentIndex + 1 : 0
    const savedPriorityNextSongId = saved.priorityNextSongId ?? null
    const priorityNextSongId = savedPriorityNextSongId !== null &&
      (persistedCurrentSong
        ? queue[priorityNextIndex]?.id === savedPriorityNextSongId
        : queue[0]?.id === savedPriorityNextSongId)
      ? savedPriorityNextSongId
      : null
    return {
      /** 本地播放队列（持久化） */
      queue,
      currentIndex,
      /** 用户指定的单次下一首优先项 */
      priorityNextSongId,
      playing: false,
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.8,
      /** 静音时保留静音前的音量，取消静音可原样恢复。 */
      muted: saved.muted === true,
      /** 播放速度：只取受支持的档位。 */
      playbackRate: normalizePlaybackRate(saved.playbackRate ?? 1),
      /** 断点续播：歌曲 id + 上次进度（秒）。 */
      resumeSongId: saved.resumeSongId ?? null,
      resumeTime: Number.isFinite(Number(saved.resumeTime)) ? Math.max(0, Number(saved.resumeTime)) : 0,
      mode: MODES.some((mode) => mode.key === saved.mode) ? saved.mode : 'order',
      /** 原歌词与可选译文歌词 */
      lyricView: normalizeLyricView(saved.lyricView),
      /** 上次是否开着 3D 空间音效（只是偏好，实际是否生效取决于音源与浏览器）。 */
      spatialPreferred: saved.spatialPreferred === true,
      /** 播放器形态：standard / mini / immersive。 */
      playerViewMode: normalizePlayerViewMode(saved.playerViewMode),
      /** 原歌词与可选译文歌词 */
      lyrics: [],
      lyricTranslations: [],
      lyricRomaji: [],
      lyricVerbatim: [],
      lyricLoadRequestId: 0,
      lyricVisible: false,
      /** 播放进度（秒，由播放器组件实时更新） */
      currentTime: 0,
      duration: 0,
      /** 睡眠定时：倒计时按本机时钟；播完当前曲目模式绑定当前歌曲 */
      sleepTimerMode: null,
      sleepTimerEndAt: null,
      sleepTimerSongId: null,
      sleepTimerLastFinishedAt: null
    }
  },
  getters: {
    currentSong: (state) => (state.currentIndex >= 0 && state.currentIndex < state.queue.length
      ? state.queue[state.currentIndex]
      : null),
    modeLabel: (state) => MODES.find((m) => m.key === state.mode)?.label || '顺序播放',
    /** 队列总时长（秒）；本地文件未读到元数据时按 0 计。 */
    queueDuration: (state) => (state.queue || []).reduce((total, song) => total + Math.max(0, Number(song?.duration) || 0), 0)
  },
  actions: {
    /** 将用户选择的音频文件加入本地队列；文件只留在浏览器内，不上传服务器。 */
    addLocalFiles(files) {
      const selected = Array.from(files || [])
      const audioFiles = selected.filter(isAudioFile)
      const startIndex = this.queue.length
      const tracks = []

      for (const file of audioFiles) {
        try {
          const audioUrl = URL.createObjectURL(file)
          const fileName = file.name || '本地音乐'
          tracks.push({
            id: createLocalTrackId(),
            title: fileName.replace(/\.[^.]+$/, '') || fileName,
            singerName: '本地文件',
            album: '本地导入',
            cover: '',
            duration: 0,
            audioUrl,
            localFileName: fileName,
            isLocal: true
          })
        } catch {
          // 某个文件创建临时地址失败时跳过它，不丢弃其余已选歌曲。
        }
      }

      if (tracks.length > 0) {
        this.queue.push(...tracks)
        persist(this)
      }
      return { count: tracks.length, startIndex, skipped: selected.length - tracks.length }
    },
    /** 把已授权句柄读出的文件加入队列。句柄本身只留在 IndexedDB，不写入播放队列持久化。 */
    addRememberedLocalFiles(entries) {
      const selected = Array.from(entries || [])
      const startIndex = this.queue.length
      const tracks = []
      let skipped = 0
      for (const entry of selected) {
        const file = entry?.file
        if (!isAudioFile(file)) {
          skipped += 1
          continue
        }
        try {
          const audioUrl = URL.createObjectURL(file)
          const fileName = file.name || entry.name || '本地音乐'
          tracks.push({
            id: createLocalTrackId(),
            title: fileName.replace(/\.[^.]+$/, '') || fileName,
            singerName: '本地文件',
            album: '本地导入',
            cover: '',
            duration: 0,
            audioUrl,
            localFileName: fileName,
            localHandleId: entry.handleId || null,
            isLocal: true
          })
        } catch {
          skipped += 1
        }
      }
      if (tracks.length > 0) {
        this.queue.push(...tracks)
        persist(this)
      }
      return { count: tracks.length, startIndex, skipped }
    },
    /** 设定本机倒计时，选择的时长必须来自产品提供的固定选项 */
    setSleepTimerMinutes(minutes) {
      const duration = Number(minutes)
      if (!SLEEP_TIMER_MINUTES.includes(duration)) return false
      this.cancelSleepTimer()
      this.sleepTimerMode = 'duration'
      this.sleepTimerEndAt = Date.now() + duration * 60_000
      scheduleSleepTimerTimeout(this)
      return true
    },
    /** 当前曲目播放完毕后停止，不自动进入下一首 */
    setStopAfterCurrentSong() {
      if (!this.currentSong) return false
      this.cancelSleepTimer()
      this.sleepTimerMode = 'track'
      this.sleepTimerSongId = this.currentSong.id
      return true
    },
    cancelSleepTimer() {
      const wasActive = this.sleepTimerMode !== null
      clearSleepTimerTimeout(this)
      this.sleepTimerMode = null
      this.sleepTimerEndAt = null
      this.sleepTimerSongId = null
      return wasActive
    },
    /** 页面恢复、定时器触发或音频进度变化时检查截止时间 */
    checkSleepTimer() {
      if (this.sleepTimerMode !== 'duration' || !this.sleepTimerEndAt) return false
      if (Date.now() < this.sleepTimerEndAt) return false
      this.finishSleepTimer()
      return true
    },
    finishSleepTimer() {
      if (this.sleepTimerMode === null) return false
      clearSleepTimerTimeout(this)
      this.sleepTimerMode = null
      this.sleepTimerEndAt = null
      this.sleepTimerSongId = null
      this.playing = false
      this.sleepTimerLastFinishedAt = Date.now()
      return true
    },
    handleSleepTimerTrackEnd(songId) {
      if (this.sleepTimerMode !== 'track' || this.sleepTimerSongId !== songId) return false
      this.finishSleepTimer()
      return true
    },
    /** 播放队列中指定下标的歌曲 */
    async playAt(index) {
      if (index < 0 || index >= this.queue.length) return
      const nextSong = this.queue[index]
      if (this.sleepTimerMode === 'track' && nextSong?.id !== this.sleepTimerSongId) {
        this.cancelSleepTimer()
      }
      this.priorityNextSongId = null
      this.currentIndex = index
      this.playing = true
      this.currentTime = 0
      persist(this)
      await this.loadLyrics(this.currentSong)
      // 本地文件与临时自定义源不请求后端、不写入服务端历史；曲库歌曲才上报播放量。
      if (this.currentSong?.id && !this.currentSong.isLocal && !this.currentSong.isCustomSource) {
        songApi.play(this.currentSong.id).catch(() => {})
      }
    },
    /** 播放一首歌曲（已在队列则跳转，否则追加到队尾播放） */
    playSong(song) {
      const idx = this.queue.findIndex((s) => s.id === song.id)
      if (idx >= 0) {
        return this.playAt(idx)
      }
      this.queue.push(song)
      persist(this)
      return this.playAt(this.queue.length - 1)
    },
    /** 用一组歌曲替换播放队列，并从指定歌曲开始播放 */
    playAll(songs, startSongId) {
      if (!songs || songs.length === 0) return
      const previousQueue = this.queue
      this.queue = [...songs]
      const retainedUrls = new Set(this.queue.filter((song) => song?.isLocal).map((song) => song.audioUrl))
      releaseLocalSongs(previousQueue, retainedUrls)
      let index = 0
      if (startSongId) {
        const found = this.queue.findIndex((s) => s.id === startSongId)
        if (found >= 0) index = found
      }
      this.priorityNextSongId = null
      persist(this)
      return this.playAt(index)
    },
    /** 把播放队列中的曲目移到目标位置，并保持正在播放的曲目不变。 */
    moveQueueItem(fromIndex, toIndex) {
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return false
      if (fromIndex < 0 || fromIndex >= this.queue.length || toIndex < 0 || toIndex >= this.queue.length) return false
      if (fromIndex === toIndex) return false

      const activeSong = this.currentSong
      const [song] = this.queue.splice(fromIndex, 1)
      this.queue.splice(toIndex, 0, song)
      this.currentIndex = activeSong ? this.queue.indexOf(activeSong) : -1
      const priorityNextIndex = this.currentIndex >= 0 ? this.currentIndex + 1 : 0
      if (this.queue[priorityNextIndex]?.id !== this.priorityNextSongId) this.priorityNextSongId = null
      persist(this)
      return true
    },
    /** 安排为下一首；随机/单曲模式也会优先播放一次。 */
    playNext(song) {
      if (!song || song.id === undefined || song.id === null) return 'invalid'
      const existingIndex = this.queue.findIndex((item) => item.id === song.id)
      if (existingIndex === this.currentIndex && this.currentSong) return 'current'

      const nextIndex = this.currentIndex >= 0 ? this.currentIndex + 1 : 0
      this.priorityNextSongId = song.id
      if (existingIndex >= 0) {
        if (existingIndex === nextIndex) {
          persist(this)
          return 'already-next'
        }
        const adjustedNextIndex = existingIndex < nextIndex ? nextIndex - 1 : nextIndex
        return this.moveQueueItem(existingIndex, adjustedNextIndex) ? 'moved' : 'already-next'
      }

      this.queue.splice(nextIndex, 0, song)
      persist(this)
      return 'added'
    },
    /** 追加一首歌曲到播放队列（去重） */
    addToQueue(song) {
      if (!song) return
      if (!this.queue.some((s) => s.id === song.id)) {
        this.queue.push(song)
        persist(this)
      }
    },
    /** 移除队列中指定下标的歌曲 */
    removeAt(index) {
      if (index < 0 || index >= this.queue.length) return
      if (index === this.currentIndex && this.sleepTimerMode === 'track') this.cancelSleepTimer()
      const wasPlaying = this.playing
      const removedSong = this.queue[index]
      if (index === this.currentIndex || removedSong?.id === this.priorityNextSongId) this.priorityNextSongId = null
      this.queue.splice(index, 1)
      revokeLocalAudio(removedSong)
      if (this.queue.length === 0) {
        this.currentIndex = -1
        this.playing = false
        this.lyricLoadRequestId++
        this.lyrics = []
        this.lyricTranslations = []
        this.lyricRomaji = []
        this.lyricVerbatim = []
        persist(this)
        return
      }
      if (index < this.currentIndex) {
        // 移除的是当前曲目之前的歌曲，下标前移一位
        this.currentIndex--
        persist(this)
        return
      }
      if (index === this.currentIndex) {
        // 移除的是正在播放的歌曲：下标不变即顶上来的下一首，继续播放
        this.currentIndex = Math.min(index, this.queue.length - 1)
        persist(this)
        if (wasPlaying) {
          this.playAt(this.currentIndex)
        } else {
          this.lyricLoadRequestId++
          this.lyrics = []
          this.lyricTranslations = []
          this.lyricRomaji = []
          this.lyricVerbatim = []
        }
      }
    },
    /** 清空播放队列 */
    clearQueue() {
      this.cancelSleepTimer()
      const previousQueue = this.queue
      this.queue = []
      this.currentIndex = -1
      this.priorityNextSongId = null
      this.playing = false
      this.lyricLoadRequestId++
      this.lyrics = []
      this.lyricTranslations = []
      this.lyricRomaji = []
      this.lyricVerbatim = []
      persist(this)
      releaseLocalSongs(previousQueue)
    },
    /**
     * 下一首：先消费用户指定的一次优先曲目（即使它被屏蔽），再按模式跳过不喜欢规则。
     * play / playAt 仍可显式播放被屏蔽曲目。
     */
    next() {
      if (this.queue.length === 0) return { played: false, blocked: false, skippedCount: 0 }
      if (this.priorityNextSongId !== null) {
        const priorityIndex = this.queue.findIndex((song) => song.id === this.priorityNextSongId)
        this.priorityNextSongId = null
        if (priorityIndex >= 0 && priorityIndex !== this.currentIndex) {
          return afterPlay(this.playAt(priorityIndex), { played: true, blocked: false, skippedCount: 0, explicit: true })
        }
        persist(this)
      }
      if (this.mode === 'random' && this.queue.length === 1) {
        return afterPlay(this.playAt(0), { played: true, blocked: false, skippedCount: 0 })
      }
      const found = findAdvanceIndex(this.queue, this.currentIndex, 1, this.mode, currentDislikeRules())
      if (found.index == null) {
        this.playing = false
        return { played: false, blocked: found.skippedCount > 0, skippedCount: found.skippedCount }
      }
      return afterPlay(this.playAt(found.index), { played: true, blocked: false, skippedCount: found.skippedCount })
    },
    /** 上一首。顺序模式在队首仍回到当前曲目；其余方向跳过不喜欢规则。 */
    prev() {
      if (this.queue.length === 0) return { played: false, blocked: false, skippedCount: 0 }
      if (this.mode === 'random' && this.queue.length === 1) {
        return afterPlay(this.playAt(0), { played: true, blocked: false, skippedCount: 0 })
      }
      if (this.currentIndex <= 0 && this.mode !== 'loop' && this.mode !== 'random') {
        return afterPlay(this.playAt(0), { played: true, blocked: false, skippedCount: 0 })
      }
      const found = findAdvanceIndex(this.queue, this.currentIndex, -1, this.mode, currentDislikeRules())
      if (found.index == null) {
        this.playing = false
        return { played: false, blocked: found.skippedCount > 0, skippedCount: found.skippedCount }
      }
      return afterPlay(this.playAt(found.index), { played: true, blocked: false, skippedCount: found.skippedCount })
    },
    /** 设置合法的播放模式，供播放器与设置页共用。 */
    setMode(mode) {
      if (!MODES.some((item) => item.key === mode)) return false
      this.mode = mode
      persist(this)
      return true
    },
    /** 切换播放模式（顺序 -> 列表循环 -> 单曲循环 -> 随机）。 */
    toggleMode() {
      const idx = MODES.findIndex((m) => m.key === this.mode)
      return this.setMode(MODES[(idx + 1) % MODES.length].key)
    },
    setVolume(volume) {
      const value = Number(volume)
      if (!Number.isFinite(value)) return false
      this.volume = Math.max(0, Math.min(1, value))
      // 拖动音量即视为要出声：音量大于 0 时自动解除静音。
      if (this.volume > 0) this.muted = false
      persist(this)
      return true
    },
    /** 静音/取消静音。取消静音时若当前音量为 0，恢复到默认音量而不是“无声的取消静音”。 */
    setMuted(muted) {
      const next = Boolean(muted)
      if (next === this.muted) return false
      if (!next && this.volume <= 0) this.volume = 0.8
      this.muted = next
      persist(this)
      return true
    },
    toggleMuted() {
      return this.setMuted(!this.muted)
    },
    setPlaybackRate(rate) {
      const next = normalizePlaybackRate(rate)
      if (next === this.playbackRate) return false
      this.playbackRate = next
      persist(this)
      return true
    },
    /** 在受支持的档位里循环切换倍速。 */
    cyclePlaybackRate() {
      const index = PLAYBACK_RATES.indexOf(this.playbackRate)
      const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
      return this.setPlaybackRate(next) ? next : this.playbackRate
    },
    /** 记录续播位置；由播放器节流调用，避免频繁写 localStorage。 */
    saveResumePosition(songId, time) {
      const seconds = Number(time)
      if (songId === undefined || songId === null || !Number.isFinite(seconds)) return false
      if (this.resumeSongId === songId && Math.abs((this.resumeTime || 0) - seconds) < 1) return false
      this.resumeSongId = songId
      this.resumeTime = Math.max(0, seconds)
      persist(this)
      return true
    },
    /** 取出某首歌的续播位置（秒）；太靠近开头或结尾都返回 0。取出后即清除。 */
    consumeResumePosition(songId, duration = 0) {
      if (songId === undefined || songId === null || this.resumeSongId !== songId) return 0
      const saved = Math.max(0, Number(this.resumeTime) || 0)
      const total = Number(duration) || 0
      this.clearResumePosition()
      if (saved < RESUME_MIN_SECONDS) return 0
      if (total > 0 && saved > total - RESUME_TAIL_GUARD_SECONDS) return 0
      return saved
    },
    clearResumePosition() {
      const changed = this.resumeSongId !== null || this.resumeTime !== 0
      this.resumeSongId = null
      this.resumeTime = 0
      if (changed) persist(this)
      return changed
    },
    /** 打乱播放队列：正在播放的曲目移到队首并继续播放，其余随机重排。 */
    shuffleQueue() {
      if (this.queue.length < 2) return false
      const activeSong = this.currentSong
      const rest = this.queue.filter((song) => song !== activeSong)
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[rest[i], rest[j]] = [rest[j], rest[i]]
      }
      this.queue = activeSong ? [activeSong, ...rest] : rest
      this.currentIndex = activeSong ? 0 : -1
      this.priorityNextSongId = null
      persist(this)
      return true
    },
    /** 去掉队列中重复的曲目（同一 id 只保留第一次出现），保持当前曲目不变。 */
    dedupeQueue() {
      if (this.queue.length === 0) return 0
      const seen = new Set()
      const removed = []
      const next = []
      for (const song of this.queue) {
        const key = song?.id
        if (key !== undefined && key !== null) {
          if (seen.has(key)) {
            removed.push(song)
            continue
          }
          seen.add(key)
        }
        next.push(song)
      }
      if (removed.length === 0) return 0
      const activeSong = this.currentSong
      this.queue = next
      this.currentIndex = activeSong ? this.queue.indexOf(activeSong) : -1
      this.priorityNextSongId = null
      persist(this)
      releaseLocalSongs(removed)
      return removed.length
    },
    /** 加载当前歌曲的原歌词与时间对齐译文 */
    async loadLyrics(song) {
      const requestId = ++this.lyricLoadRequestId
      if (song?.isCustomSource) {
        this.lyrics = Array.isArray(song.customLyrics) ? song.customLyrics : []
        this.lyricTranslations = Array.isArray(song.customTranslationLyrics) ? song.customTranslationLyrics : []
        this.lyricRomaji = Array.isArray(song.customRomajiLyrics) ? song.customRomajiLyrics : []
        this.lyricVerbatim = Array.isArray(song.customVerbatimLyrics) ? song.customVerbatimLyrics : []
        return
      }
      if (!song?.id || song.isLocal) {
        this.lyrics = []
        this.lyricTranslations = []
        this.lyricRomaji = []
        this.lyricVerbatim = []
        return
      }
      try {
        const res = await lyricApi.parse(song.id)
        if (requestId !== this.lyricLoadRequestId) return
        this.lyrics = Array.isArray(res?.lines) ? res.lines : []
        this.lyricTranslations = Array.isArray(res?.translationLines) ? res.translationLines : []
        this.lyricRomaji = Array.isArray(res?.romajiLines) ? res.romajiLines : []
        this.lyricVerbatim = Array.isArray(res?.verbatimLines) ? res.verbatimLines : []
      } catch (e) {
        if (requestId !== this.lyricLoadRequestId) return
        this.lyrics = []
        this.lyricTranslations = []
        this.lyricRomaji = []
        this.lyricVerbatim = []
      }
    },
    /**
     * 快速换源：用新的音频地址替换当前曲目（保留队列位置与播放进度）。
     * 只改播放地址与来源标注，不动曲库身份（id 不变，歌词/收藏等仍然有效）。
     */
    applySourceToCurrent({ audioUrl, sourceName = '', sourcePlatform = '', sourceQuality = '', isCustomSource = true }) {
      const index = this.currentIndex
      if (index < 0 || index >= this.queue.length) return false
      const url = String(audioUrl || '').trim()
      if (!url) return false
      const previous = this.queue[index]
      const resumeAt = this.currentTime
      // 整项替换而不是就地改属性：currentSong 计算属性才会重新求值并触发播放器重新加载。
      this.queue[index] = {
        ...previous,
        audioUrl: url,
        sourceName: String(sourceName || '') || previous.sourceName,
        sourcePlatform: String(sourcePlatform || '') || previous.sourcePlatform,
        sourceQuality: String(sourceQuality || '') || previous.sourceQuality,
        isCustomSource: Boolean(isCustomSource),
        sourceSwitchedAt: Date.now()
      }
      this.currentTime = resumeAt
      persist(this)
      return true
    },
    toggleLyric() {
      this.lyricVisible = !this.lyricVisible
    },
    /** 合并歌词显示偏好（译文/罗马音/逐字/沉浸/字号/时间校准），非法值自动收敛。 */
    setLyricView(patch) {
      const next = normalizeLyricView({ ...this.lyricView, ...(patch && typeof patch === 'object' ? patch : {}) })
      this.lyricView = next
      persist(this)
      return next
    },
    /** 微调歌词时间校准（毫秒，正值＝歌词提前出现），返回校准后的偏移。 */
    adjustLyricOffset(deltaMs) {
      const step = Number(deltaMs)
      if (!Number.isFinite(step)) return this.lyricView.offsetMs
      const raw = Math.round((this.lyricView.offsetMs + step) / 10) * 10
      const clamped = Math.max(-LYRIC_OFFSET_LIMIT_MS, Math.min(LYRIC_OFFSET_LIMIT_MS, raw))
      return this.setLyricView({ offsetMs: clamped }).offsetMs
    },
    /** 清除歌词时间校准。 */
    resetLyricOffset() {
      return this.setLyricView({ offsetMs: 0 }).offsetMs
    },
    /** 切换播放器形态（标准 / 迷你 / 沉浸）。 */
    setPlayerViewMode(mode) {
      this.playerViewMode = normalizePlayerViewMode(mode)
      persist(this)
      return this.playerViewMode
    },
    /** 按顺序循环：标准 → 迷你 → 沉浸 → 标准。 */
    cyclePlayerViewMode() {
      const index = PLAYER_VIEW_MODE_KEYS.indexOf(normalizePlayerViewMode(this.playerViewMode))
      return this.setPlayerViewMode(PLAYER_VIEW_MODE_KEYS[(index + 1) % PLAYER_VIEW_MODE_KEYS.length])
    },
    /** 记住空间音效开关；音源不支持时不清除偏好，下次遇到可用音源仍会套用。 */
    setSpatialPreferred(preferred) {
      this.spatialPreferred = preferred === true
      persist(this)
      return this.spatialPreferred
    }
  }
})

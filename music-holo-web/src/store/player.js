import { defineStore } from 'pinia'
import * as songApi from '@/api/song'
import * as lyricApi from '@/api/lyric'

const PLAYER_KEY = 'mh_player'

/** 播放模式 */
export const MODES = [
  { key: 'order', label: '顺序播放' },
  { key: 'loop', label: '列表循环' },
  { key: 'single', label: '单曲循环' },
  { key: 'random', label: '随机播放' }
]

export const SLEEP_TIMER_MINUTES = [15, 30, 45, 60]
const AUDIO_FILE_EXTENSION = /\.(aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|weba|webm)$/i
const sleepTimerHandles = new WeakMap()

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
  const currentIndex = currentSong && !currentSong.isLocal && !currentSong.isCustomSource
    ? persistentQueue.findIndex((song) => song.id === currentSong.id)
    : -1

  localStorage.setItem(PLAYER_KEY, JSON.stringify({
    queue: persistentQueue,
    currentIndex,
    mode: state.mode,
    volume: state.volume
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
    return {
      /** 本地播放队列（持久化） */
      queue,
      currentIndex,
      playing: false,
      volume: typeof saved.volume === 'number' ? saved.volume : 0.8,
      mode: saved.mode || 'order',
      /** 歌词 */
      lyrics: [],
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
    modeLabel: (state) => MODES.find((m) => m.key === state.mode)?.label || '顺序播放'
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
      persist(this)
      return this.playAt(index)
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
      this.queue.splice(index, 1)
      revokeLocalAudio(removedSong)
      if (this.queue.length === 0) {
        this.currentIndex = -1
        this.playing = false
        this.lyrics = []
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
          this.lyrics = []
        }
      }
    },
    /** 清空播放队列 */
    clearQueue() {
      this.cancelSleepTimer()
      const previousQueue = this.queue
      this.queue = []
      this.currentIndex = -1
      this.playing = false
      this.lyrics = []
      persist(this)
      releaseLocalSongs(previousQueue)
    },
    /** 下一首 */
    next() {
      if (this.queue.length === 0) return
      if (this.mode === 'random') {
        if (this.queue.length === 1) return this.playAt(0)
        let idx = this.currentIndex
        while (idx === this.currentIndex) {
          idx = Math.floor(Math.random() * this.queue.length)
        }
        return this.playAt(idx)
      }
      const nextIndex = this.currentIndex + 1
      if (nextIndex < this.queue.length) {
        return this.playAt(nextIndex)
      }
      if (this.mode === 'loop') {
        return this.playAt(0)
      }
      // 顺序播放到末尾，停止
      this.playing = false
    },
    /** 上一首 */
    prev() {
      if (this.queue.length === 0) return
      if (this.mode === 'random') {
        let idx = this.currentIndex
        while (idx === this.currentIndex) {
          idx = Math.floor(Math.random() * this.queue.length)
        }
        return this.playAt(idx)
      }
      const prevIndex = this.currentIndex - 1
      if (prevIndex >= 0) {
        return this.playAt(prevIndex)
      }
      if (this.mode === 'loop') {
        return this.playAt(this.queue.length - 1)
      }
      return this.playAt(0)
    },
    /** 切换播放模式（循环：顺序 -> 列表循环 -> 单曲循环 -> 随机） */
    toggleMode() {
      const idx = MODES.findIndex((m) => m.key === this.mode)
      this.mode = MODES[(idx + 1) % MODES.length].key
      persist(this)
    },
    setVolume(volume) {
      this.volume = volume
      persist(this)
    },
    /** 加载当前歌曲歌词 */
    async loadLyrics(song) {
      if (song?.isCustomSource) {
        this.lyrics = Array.isArray(song.customLyrics) ? song.customLyrics : []
        return
      }
      if (!song?.id || song.isLocal) {
        this.lyrics = []
        return
      }
      try {
        const res = await lyricApi.parse(song.id)
        this.lyrics = res?.lines || []
      } catch (e) {
        this.lyrics = []
      }
    },
    toggleLyric() {
      this.lyricVisible = !this.lyricVisible
    }
  }
})

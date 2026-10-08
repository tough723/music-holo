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

function loadPersisted() {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_KEY) || '{}')
  } catch (e) {
    return {}
  }
}

function persist(state) {
  localStorage.setItem(PLAYER_KEY, JSON.stringify({
    queue: state.queue,
    currentIndex: state.currentIndex,
    mode: state.mode,
    volume: state.volume
  }))
}

export const usePlayerStore = defineStore('player', {
  state: () => {
    const saved = loadPersisted()
    return {
      /** 本地播放队列（持久化） */
      queue: Array.isArray(saved.queue) ? saved.queue : [],
      currentIndex: typeof saved.currentIndex === 'number' ? saved.currentIndex : -1,
      playing: false,
      volume: typeof saved.volume === 'number' ? saved.volume : 0.8,
      mode: saved.mode || 'order',
      /** 歌词 */
      lyrics: [],
      lyricVisible: false,
      /** 播放进度（秒，由播放器组件实时更新） */
      currentTime: 0,
      duration: 0
    }
  },
  getters: {
    currentSong: (state) => (state.currentIndex >= 0 && state.currentIndex < state.queue.length
      ? state.queue[state.currentIndex]
      : null),
    modeLabel: (state) => MODES.find((m) => m.key === state.mode)?.label || '顺序播放'
  },
  actions: {
    /** 播放队列中指定下标的歌曲 */
    async playAt(index) {
      if (index < 0 || index >= this.queue.length) return
      this.currentIndex = index
      this.playing = true
      this.currentTime = 0
      persist(this)
      await this.loadLyrics(this.currentSong)
      // 上报播放（播放量 +1），失败不影响播放
      if (this.currentSong?.id) {
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
      this.queue = [...songs]
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
      const wasPlaying = this.playing
      this.queue.splice(index, 1)
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
      this.queue = []
      this.currentIndex = -1
      this.playing = false
      this.lyrics = []
      persist(this)
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
      if (!song?.id) {
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

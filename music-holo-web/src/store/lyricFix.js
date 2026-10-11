import { defineStore } from 'pinia'
import { LYRIC_OFFSET_LIMIT_MS } from '@/store/player'

const STORAGE_KEY = 'mh_lyric_fix_v1'
/**
 * 单曲校正的合理范围：与播放器时间校准的上下限完全一致，
 * 否则会存下一个播放器根本套用不了的值。
 */
export const LYRIC_FIX_LIMIT_MS = LYRIC_OFFSET_LIMIT_MS
/** 众包校正生效门槛：少于这个份数的上报不作为默认值下发。 */
export const LYRIC_FIX_MIN_REPORTS = 3

function clampOffset(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value)) return 0
  return Math.max(-LYRIC_FIX_LIMIT_MS, Math.min(LYRIC_FIX_LIMIT_MS, Math.round(value)))
}

function readCorrections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const result = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue
      result[key] = {
        songId: value.songId ?? key,
        title: typeof value.title === 'string' ? value.title.slice(0, 120) : '',
        artist: typeof value.artist === 'string' ? value.artist.slice(0, 120) : '',
        offsetMs: clampOffset(value.offsetMs),
        submitted: value.submitted === true,
        updatedAt: Number(value.updatedAt) || 0
      }
    }
    return result
  } catch {
    return {}
  }
}

function writeCorrections(corrections) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections))
  } catch {
    // 隐私模式或配额写满：校正不能影响歌词显示，静默放弃。
  }
}

/**
 * 歌词时间轴校正（P2-9）。
 *
 * 本机账本始终先落盘：网络不通、没登录、接口报错时校正也不会丢，
 * 等下次可用时再补交。`submitted` 标记只说明「已成功提交到服务端」。
 */
export const useLyricFixStore = defineStore('lyricFix', {
  state: () => ({
    corrections: readCorrections()
  }),
  getters: {
    /** 已保存但还没提交成功的校正。 */
    pending: (state) => Object.values(state.corrections).filter((item) => item.offsetMs !== 0 && !item.submitted),
    pendingCount() {
      return this.pending.length
    },
    correctionFor: (state) => (songId) => state.corrections[String(songId)] || null
  },
  actions: {
    /** 记录（或覆盖）一首歌的校正。offsetMs = 0 表示撤回归零。 */
    saveCorrection({ songId, title = '', artist = '', offsetMs = 0, submitted = false }) {
      if (songId === undefined || songId === null || songId === '') return null
      const key = String(songId)
      const entry = {
        songId: songId ?? key,
        title,
        artist,
        offsetMs: clampOffset(offsetMs),
        submitted: submitted === true,
        updatedAt: Date.now()
      }
      this.corrections = { ...this.corrections, [key]: entry }
      writeCorrections(this.corrections)
      return entry
    },
    /** 标记某首歌的校正已成功提交（服务端已收到）。 */
    markSubmitted(songId) {
      const key = String(songId)
      const current = this.corrections[key]
      if (!current) return null
      const next = { ...current, submitted: true, updatedAt: Date.now() }
      this.corrections = { ...this.corrections, [key]: next }
      writeCorrections(this.corrections)
      return next
    },
    removeCorrection(songId) {
      if (songId === undefined || songId === null) return
      const key = String(songId)
      if (!(key in this.corrections)) return
      const next = { ...this.corrections }
      delete next[key]
      this.corrections = next
      writeCorrections(this.corrections)
    },
    /** 导出全部校正（自查或人工提交用）。 */
    exportCorrections() {
      return Object.values(this.corrections).map((item) => ({ ...item }))
    },
    clear() {
      this.corrections = {}
      writeCorrections(this.corrections)
    }
  }
})

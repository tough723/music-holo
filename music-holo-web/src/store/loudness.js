import { defineStore } from 'pinia'
import {
  DEFAULT_LOUDNESS_TARGET,
  LOUDNESS_TARGETS,
  describeLufs,
  normalizeLoudnessTarget,
  suggestGain,
  targetLufs
} from '@/utils/loudness'

const STORAGE_KEY = 'mh_loudness_v1'
/** 最多记住多少首歌的实测响度，避免 localStorage 无限增长。 */
const MAX_TRACKS = 500

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const tracks = {}
    const source = parsed.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {}
    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== 'object') continue
      tracks[key] = {
        lufs: Number.isFinite(Number(value.lufs)) ? Number(value.lufs) : null,
        peak: Number.isFinite(Number(value.peak)) ? Math.max(0, Math.min(1, Number(value.peak))) : null,
        measuredAt: Number(value.measuredAt) || 0
      }
    }
    return { target: normalizeLoudnessTarget(parsed.target), tracks }
  } catch {
    return null
  }
}

function writeState(target, tracks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ target, tracks }))
  } catch {
    // 隐私模式或配额写满：响度归一化不能影响播放，静默放弃。
  }
}

/**
 * 响度归一化（P2-10）。
 *
 * 只保存「这首曲子实测有多响」和「想要的目标响度」，不碰音频文件本身；
 * 实测是可选的：没有实测值时只走动态部分（处理链路里的压缩器），不会瞎猜增益。
 */
export const useLoudnessStore = defineStore('loudness', {
  state: () => {
    const saved = readState()
    return {
      target: saved?.target || DEFAULT_LOUDNESS_TARGET,
      tracks: saved?.tracks || {}
    }
  },
  getters: {
    enabled: (state) => targetLufs(state.target) !== null,
    options: () => LOUDNESS_TARGETS,
    /** 当前目标的 LUFS，关闭时为 null。 */
    goal: (state) => targetLufs(state.target),
    measuredFor: (state) => (songId) => state.tracks[String(songId)] || null,
    /** 某首歌当前的补偿增益（线性倍数），无实测或关闭时为 1。 */
    gainFor() {
      return (songId) => {
        if (!this.enabled) return 1
        const measured = this.measuredFor(songId)
        if (!measured) return 1
        return suggestGain(measured, { targetLufs: this.goal }).gain
      }
    },
    /** 展示用的补偿描述，例如「+3.2dB」。 */
    labelFor() {
      return (songId) => {
        if (!this.enabled) return '未启用'
        const measured = this.measuredFor(songId)
        if (!measured) return describeLufs(null)
        const { gainDb, limited } = suggestGain(measured, { targetLufs: this.goal })
        const sign = gainDb > 0 ? '+' : ''
        return `${describeLufs(measured.lufs)} · ${sign}${gainDb.toFixed(1)}dB${limited ? '（受峰值上限限制）' : ''}`
      }
    }
  },
  actions: {
    setTarget(key) {
      this.target = normalizeLoudnessTarget(key)
      writeState(this.target, this.tracks)
      return this.target
    },
    /** 记下一首歌的实测响度与峰值。 */
    recordMeasurement(songId, { lufs, peak }) {
      if (songId === undefined || songId === null) return null
      const entry = {
        lufs: Number.isFinite(Number(lufs)) ? Number(lufs) : null,
        peak: Number.isFinite(Number(peak)) ? Math.max(0, Math.min(1, Number(peak))) : null,
        measuredAt: Date.now()
      }
      const key = String(songId)
      const next = { ...this.tracks, [key]: entry }
      // 超出上限时丢掉最旧的记录。
      const keys = Object.keys(next)
      if (keys.length > MAX_TRACKS) {
        for (const stale of keys.sort((a, b) => (next[a].measuredAt || 0) - (next[b].measuredAt || 0)).slice(0, keys.length - MAX_TRACKS)) {
          delete next[stale]
        }
      }
      this.tracks = next
      writeState(this.target, this.tracks)
      return entry
    },
    forgetMeasurement(songId) {
      if (songId === undefined || songId === null) return
      const key = String(songId)
      if (!(key in this.tracks)) return
      const next = { ...this.tracks }
      delete next[key]
      this.tracks = next
      writeState(this.target, this.tracks)
    },
    clear() {
      this.tracks = {}
      writeState(this.target, this.tracks)
    }
  }
})

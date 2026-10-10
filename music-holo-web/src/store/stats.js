import { defineStore } from 'pinia'
import {
  PLAY_STATS_MAX_EVENTS,
  PLAY_STATS_VERSION,
  dailyTrend,
  summarize
} from '@/utils/playStats'

const STORAGE_KEY = 'mh_play_stats_v1'

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Number(parsed.version) !== PLAY_STATS_VERSION) return null
    return Array.isArray(parsed.events) ? parsed.events.filter((item) => item && typeof item === 'object') : []
  } catch {
    return null
  }
}

function writeState(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: PLAY_STATS_VERSION, events }))
  } catch {
    // 隐私模式或配额写满：统计不能影响播放，静默放弃。
  }
}

/**
 * 序列化 3000 条事件是毫秒级开销，播放中每首歌都会记几条事件，
 * 所以写盘做节流（1 秒内最多一次 + 尾部补写），并提供 flush() 在页面离开/卸载时兜底。
 */
const WRITE_THROTTLE_MS = 1000
let lastWriteAt = 0
let pendingWrite = null

function scheduleWrite(events) {
  if (pendingWrite !== null) return
  const wait = Math.max(0, WRITE_THROTTLE_MS - (Date.now() - lastWriteAt))
  pendingWrite = setTimeout(() => {
    pendingWrite = null
    lastWriteAt = Date.now()
    writeState(events)
  }, wait)
}

function cancelWrite() {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite)
    pendingWrite = null
  }
}

/**
 * 收听统计。
 *
 * 只落本地 localStorage，不做任何网络上报（项目没有统计后端，接了再批量上报同一份事件即可）。
 * 记录的是曲目 id/标题/艺人与时长、来源，不含音频内容、位置信息与任何标识符。
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    events: readState() || []
  }),
  getters: {
    total: (state) => summarize(state.events),
    today: (state) => summarize(state.events, { sinceDays: 1 }),
    last7Days: (state) => summarize(state.events, { sinceDays: 7 }),
    trend() {
      return dailyTrend(this.events, { days: 7 })
    }
  },
  actions: {
    /**
     * 记一条事件。字段不足时补齐时间戳并裁剪到上限。
     * @returns {object|null} 实际写入的事件
     */
    record(event = {}) {
      if (!event || typeof event !== 'object') return null
      const type = event.type
      if (type !== 'play' && type !== 'skip' && type !== 'complete' && type !== 'error') return null
      const entry = {
        type,
        songId: event.songId ?? null,
        title: typeof event.title === 'string' ? event.title.slice(0, 120) : '',
        artist: typeof event.artist === 'string' ? event.artist.slice(0, 120) : '',
        source: typeof event.source === 'string' ? event.source.slice(0, 60) : '',
        duration: Math.max(0, Number(event.duration) || 0),
        position: Math.max(0, Number(event.position) || 0),
        at: Number(event.at) || Date.now()
      }
      this.events.push(entry)
      if (this.events.length > PLAY_STATS_MAX_EVENTS) {
        this.events = this.events.slice(this.events.length - PLAY_STATS_MAX_EVENTS)
      }
      scheduleWrite(this.events)
      return entry
    },
    /** 立即把待写的事件落盘（页面离开、组件卸载、导出前调用）。 */
    flush() {
      cancelWrite()
      lastWriteAt = Date.now()
      writeState(this.events)
    },
    /** 导出全部事件（用户自查或将来上报用）。 */
    exportEvents() {
      this.flush()
      return this.events.slice()
    },
    clear() {
      this.events = []
      cancelWrite()
      writeState(this.events)
    }
  }
})

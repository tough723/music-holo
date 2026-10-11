import { defineStore } from 'pinia'
import { reportStatEvents } from '@/api/stats'
import {
  PLAY_STATS_MAX_EVENTS,
  PLAY_STATS_VERSION,
  dailyTrend,
  summarize
} from '@/utils/playStats'

const STORAGE_KEY = 'mh_play_stats_v1'
/** 已上报 eventId 的保留上限：够覆盖 2 倍事件账本，防幂等集合无限增长。 */
const REPORTED_IDS_MAX = PLAY_STATS_MAX_EVENTS * 2
/** 服务端单批上限（与 StatEventService.MAX_BATCH 一致）。 */
const REPORT_BATCH_SIZE = 200

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || Number(parsed.version) !== PLAY_STATS_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function readState() {
  const parsed = readRaw()
  if (!parsed) return null
  return Array.isArray(parsed.events) ? parsed.events.filter((item) => item && typeof item === 'object') : []
}

function readReportedIds() {
  const parsed = readRaw()
  if (!parsed || !Array.isArray(parsed.reportedEventIds)) return []
  return parsed.reportedEventIds.filter((id) => typeof id === 'string' && id).slice(-REPORTED_IDS_MAX)
}

function writeState(events, reportedEventIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: PLAY_STATS_VERSION,
      events,
      ...(reportedEventIds ? { reportedEventIds } : {})
    }))
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

function scheduleWrite(events, getReportedIds) {
  if (pendingWrite !== null) return
  const wait = Math.max(0, WRITE_THROTTLE_MS - (Date.now() - lastWriteAt))
  pendingWrite = setTimeout(() => {
    pendingWrite = null
    lastWriteAt = Date.now()
    writeState(events, getReportedIds ? getReportedIds() : undefined)
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
 * 本地账本先行：所有事件先落 localStorage（含标题/艺人，供「收听报告」本地统计）。
 * 服务端上报（P2-8）是尽力而为的旁路：reportPending 只发送 eventId/类型/歌曲 id/秒数，
 * 标题、艺人、来源永不出机器；未登录或网络失败都静默跳过，绝不影响播放。
 */
export const useStatsStore = defineStore('stats', {
  state: () => ({
    events: readState() || [],
    /** 已上报成功的 eventId（幂等集合，落盘） */
    reportedEventIds: readReportedIds()
  }),
  getters: {
    total: (state) => summarize(state.events),
    today: (state) => summarize(state.events, { sinceDays: 1 }),
    last7Days: (state) => summarize(state.events, { sinceDays: 7 }),
    trend() {
      return dailyTrend(this.events, { days: 7 })
    },
    /** 尚未上报服务端的事件（幂等集合之外的事件）。 */
    pendingEvents(state) {
      const reported = new Set(state.reportedEventIds)
      return state.events.filter((event) => event.eventId && !reported.has(event.eventId))
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
      const at = Number(event.at) || Date.now()
      const entry = {
        type,
        eventId: typeof event.eventId === 'string' && event.eventId
          ? event.eventId.slice(0, 64)
          : `${at}-${Math.random().toString(36).slice(2, 10)}`,
        songId: event.songId ?? null,
        title: typeof event.title === 'string' ? event.title.slice(0, 120) : '',
        artist: typeof event.artist === 'string' ? event.artist.slice(0, 120) : '',
        source: typeof event.source === 'string' ? event.source.slice(0, 60) : '',
        duration: Math.max(0, Number(event.duration) || 0),
        position: Math.max(0, Number(event.position) || 0),
        at
      }
      this.events.push(entry)
      if (this.events.length > PLAY_STATS_MAX_EVENTS) {
        this.events = this.events.slice(this.events.length - PLAY_STATS_MAX_EVENTS)
      }
      scheduleWrite(this.events, () => this.reportedEventIds)
      return entry
    },
    /** 立即把待写的事件落盘（页面离开、组件卸载、导出前调用）。 */
    flush() {
      cancelWrite()
      lastWriteAt = Date.now()
      writeState(this.events, this.reportedEventIds)
    },
    /** 导出全部事件（用户自查或将来上报用）。 */
    exportEvents() {
      this.flush()
      return this.events.slice()
    },
    /** 标记一批 eventId 已上报（幂等；顺序保留、超长裁旧）。 */
    markReported(eventIds = []) {
      if (!eventIds.length) return
      const known = new Set(this.reportedEventIds)
      for (const id of eventIds) {
        if (typeof id === 'string' && id && !known.has(id)) {
          known.add(id)
          this.reportedEventIds.push(id)
        }
      }
      if (this.reportedEventIds.length > REPORTED_IDS_MAX) {
        this.reportedEventIds = this.reportedEventIds.slice(-REPORTED_IDS_MAX)
      }
      this.flush()
    },
    /**
     * 把未上报的事件分批发给服务端（≤200 条/批，eventId 幂等可安全重试）。
     * 隐私：只带 eventId/type/songId/duration/position/at；标题、艺人、来源留在本地。
     * 永不抛出：离线、未登录、服务端故障都只影响返回值。
     * @param {{apiCall?: Function, maxBatches?: number}} options apiCall 供测试注入。
     */
    async reportPending({ apiCall, maxBatches = Infinity } = {}) {
      this.flush()
      if (!localStorage.getItem('mh_token')) return { reported: 0, batches: 0, skipped: 'offline' }
      const pending = this.pendingEvents
      if (pending.length === 0) return { reported: 0, batches: 0 }
      const send = apiCall || reportStatEvents
      let reported = 0
      let batches = 0
      try {
        for (let i = 0; i < pending.length && batches < maxBatches; i += REPORT_BATCH_SIZE) {
          const chunk = pending.slice(i, i + REPORT_BATCH_SIZE)
          const payload = chunk.map((event) => ({
            eventId: event.eventId,
            type: event.type,
            songId: event.songId ?? null,
            duration: event.duration ?? 0,
            position: event.position ?? 0,
            at: event.at
          }))
          await send(payload)
          this.markReported(chunk.map((event) => event.eventId))
          reported += chunk.length
          batches++
        }
      } catch {
        // 单批失败即停：eventId 幂等，下次调用从同一批安全重试。
      }
      return { reported, batches }
    },
    clear() {
      this.events = []
      this.reportedEventIds = []
      cancelWrite()
      writeState(this.events, this.reportedEventIds)
    }
  }
})

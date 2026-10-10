/**
 * 收听统计的纯计算部分：把一串事件聚合成可展示的指标。
 *
 * 事件形态（只存本地、不上传）：
 *   { type: 'play' | 'skip' | 'complete' | 'error', songId, title, artist, source, duration, position, at }
 *   - play：一首歌开始播放（切歌也算一次）
 *   - skip：没播完就被切走/移除，position 是被切走时的进度
 *   - complete：自然播完
 *   - error：起播或播放失败
 *
 * 这里刻意不引入任何网络调用：项目没有统计后端，先做成纯本地指标，
 * 将来接后端时把同一份事件批量上报即可，聚合口径不用改。
 */

export const PLAY_STATS_VERSION = 1
/** 事件上限：环形裁剪，避免 localStorage 无限增长（约 3000 条 ≈ 300KB）。 */
export const PLAY_STATS_MAX_EVENTS = 3000
/** “有效播放”门槛：低于这个比例就当跳过，不计入听完。 */
export const EFFECTIVE_PLAY_RATIO = 0.6
/** 低于这个秒数的播放不计入有效播放（误触、探测性点击）。 */
export const MIN_EFFECTIVE_SECONDS = 10

export function normalizeSeconds(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

/** 事件是否算“有效播放”：自然听完，或听到 60% 以上且超过 10 秒。 */
export function isEffectivePlay(event) {
  if (!event) return false
  if (event.type === 'complete') return true
  if (event.type !== 'skip') return false
  return (
    normalizeSeconds(event.position) >= MIN_EFFECTIVE_SECONDS &&
    completionRatio(event) >= EFFECTIVE_PLAY_RATIO
  )
}

export function completionRatio(event) {
  if (!event) return 0
  const duration = normalizeSeconds(event.duration)
  const position = normalizeSeconds(event.position)
  if (duration <= 0) return 0
  return Math.min(1, Math.max(0, position / duration))
}

/** 一个事件贡献的收听时长（秒）：完成时按整曲，跳过时按实际进度。 */
export function listenedSeconds(event) {
  if (!event) return 0
  if (event.type === 'complete') return normalizeSeconds(event.duration)
  if (event.type === 'skip') return normalizeSeconds(event.position)
  return 0
}

export function emptySummary() {
  return {
    plays: 0,
    effectivePlays: 0,
    skips: 0,
    errors: 0,
    seconds: 0,
    completionRate: 0,
    skipRate: 0,
    averageCompletion: 0,
    topSongs: [],
    topArtists: [],
    sourceErrors: []
  }
}

function bump(map, key, amount = 1) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + amount)
}

function topN(map, limit) {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || String(a.key).localeCompare(String(b.key)))
    .slice(0, limit)
}

function dayKey(at) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfDay(now) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * 聚合事件。
 * @param {Array} events 事件数组（内部会过滤非法项）
 * @param {{ now?: number, limit?: number, sinceDays?: number }} options
 */
export function summarize(events, { now = Date.now(), limit = 5, sinceDays = 0 } = {}) {
  const summary = emptySummary()
  const list = Array.isArray(events) ? events : []
  const from = sinceDays > 0 ? startOfDay(now) - (sinceDays - 1) * 86400000 : null
  const songs = new Map()
  const artists = new Map()
  const errors = new Map()
  let completionTotal = 0
  let completionCount = 0

  for (const event of list) {
    if (!event || typeof event !== 'object') continue
    const at = Number(event.at)
    if (!Number.isFinite(at) || at <= 0) continue
    if (from !== null && at < from) continue

    if (event.type === 'play') summary.plays += 1
    if (event.type === 'error') {
      summary.errors += 1
      bump(errors, event.source || '未知来源')
      continue
    }
    const seconds = listenedSeconds(event)
    summary.seconds += seconds
    if (event.type === 'complete') {
      summary.effectivePlays += 1
      completionTotal += 1
      completionCount += 1
    }
    if (event.type === 'skip') {
      if (isEffectivePlay(event)) {
        summary.effectivePlays += 1
        completionTotal += 1
        completionCount += 1
      } else {
        summary.skips += 1
        completionTotal += completionRatio(event)
        completionCount += 1
      }
    }
    if (event.type === 'complete' || event.type === 'skip') {
      // Top 榜按实际收听时长排：只有产生时长的结果事件才入榜，单纯起播不算。
      bump(songs, event.title || event.songId, seconds)
      bump(artists, event.artist || '未知艺人', seconds)
    }
  }

  const attempts = summary.effectivePlays + summary.skips
  summary.completionRate = attempts > 0 ? summary.effectivePlays / attempts : 0
  summary.skipRate = attempts > 0 ? summary.skips / attempts : 0
  summary.averageCompletion = completionCount > 0 ? completionTotal / completionCount : 0
  summary.topSongs = topN(songs, limit).map((item) => ({ title: item.key, seconds: Math.round(item.value) }))
  summary.topArtists = topN(artists, limit).map((item) => ({ artist: item.key, seconds: Math.round(item.value) }))
  summary.sourceErrors = topN(errors, limit).map((item) => ({ source: item.key, count: item.value }))
  return summary
}

/** 按天切片：返回最近 days 天的 [{ day, seconds, plays }]，用于迷你趋势条。 */
export function dailyTrend(events, { now = Date.now(), days = 7 } = {}) {
  const list = Array.isArray(events) ? events : []
  const buckets = new Map()
  for (const event of list) {
    const at = Number(event?.at)
    if (!Number.isFinite(at) || at <= 0) continue
    const key = dayKey(at)
    if (!key) continue
    const current = buckets.get(key) || { day: key, seconds: 0, plays: 0 }
    current.seconds += listenedSeconds(event)
    if (event.type === 'play') current.plays += 1
    buckets.set(key, current)
  }
  const result = []
  const base = startOfDay(now)
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(base - offset * 86400000)
    const key = dayKey(date.getTime())
    const found = buckets.get(key)
    result.push({ day: key, seconds: Math.round(found?.seconds || 0), plays: found?.plays || 0 })
  }
  return result
}

export function formatSeconds(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  const rest = Math.floor(total % 60)
  return `${minutes} 分 ${rest} 秒`
}

export function formatPercent(ratio) {
  const value = Number(ratio)
  if (!Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

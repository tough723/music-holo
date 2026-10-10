import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  EFFECTIVE_PLAY_RATIO,
  MIN_EFFECTIVE_SECONDS,
  PLAY_STATS_MAX_EVENTS,
  completionRatio,
  dailyTrend,
  formatSeconds,
  isEffectivePlay,
  listenedSeconds,
  summarize
} from '../src/utils/playStats.js'
import { useStatsStore } from '../src/store/stats.js'

const at = (dayOffset = 0, hour = 10) => {
  const date = new Date(2026, 0, 1 + dayOffset, hour, 0, 0)
  return date.getTime()
}

describe('收听统计聚合', () => {
  it('完成按整曲计时长，跳过按实际进度计时长', () => {
    expect(listenedSeconds({ type: 'complete', duration: 200, position: 0 })).toBe(200)
    expect(listenedSeconds({ type: 'skip', duration: 200, position: 30 })).toBe(30)
    expect(listenedSeconds({ type: 'play' })).toBe(0)
    expect(listenedSeconds(null)).toBe(0)
    expect(completionRatio({ duration: 200, position: 50 })).toBeCloseTo(0.25)
    expect(completionRatio({ duration: 0, position: 50 })).toBe(0)
  })

  it('听到 60% 以上算有效播放，短促的跳过算跳过', () => {
    const passed = { type: 'skip', duration: 200, position: 200 * EFFECTIVE_PLAY_RATIO }
    expect(isEffectivePlay(passed)).toBe(true)
    expect(isEffectivePlay({ type: 'complete' })).toBe(true)
    // 时长很短（探测性播放）不算有效播放
    expect(isEffectivePlay({ type: 'skip', duration: 30, position: MIN_EFFECTIVE_SECONDS + 1 })).toBe(false)
    expect(isEffectivePlay({ type: 'skip', duration: 200, position: 5 })).toBe(false)
    expect(isEffectivePlay({ type: 'play' })).toBe(false)
  })

  it('汇总完成率、跳过率、Top 曲目与失败来源', () => {
    const events = [
      { type: 'play', title: 'A', artist: '甲', duration: 200, at: at() },
      { type: 'complete', title: 'A', artist: '甲', duration: 200, at: at() },
      { type: 'play', title: 'B', artist: '乙', duration: 100, at: at() },
      { type: 'skip', title: 'B', artist: '乙', duration: 100, position: 90, at: at() }, // 90% → 听完
      { type: 'play', title: 'C', artist: '乙', duration: 100, at: at() },
      { type: 'skip', title: 'C', artist: '乙', duration: 100, position: 10, at: at() }, // 10% → 跳过
      { type: 'error', source: 'QQ 音乐', at: at() },
      { type: 'error', source: 'QQ 音乐', at: at() },
      { type: 'error', source: '网易云', at: at() },
      { type: 'play', at: 0 }, // 缺时间戳：忽略
      null
    ]
    const total = summarize(events, { now: at() })
    expect(total.plays).toBe(3) // 缺时间戳的 play 被忽略
    expect(total.effectivePlays).toBe(2)
    expect(total.skips).toBe(1)
    expect(total.errors).toBe(2 + 1)
    expect(total.seconds).toBe(200 + 90 + 10)
    expect(total.completionRate).toBeCloseTo(2 / 3)
    expect(total.skipRate).toBeCloseTo(1 / 3)
    expect(total.topSongs[0]).toEqual({ title: 'A', seconds: 200 })
    expect(total.topArtists[0]).toEqual({ artist: '甲', seconds: 200 }) // A 全曲听完
    expect(total.topArtists[1]).toEqual({ artist: '乙', seconds: 100 }) // B 90s + C 10s
    expect(total.sourceErrors[0]).toEqual({ source: 'QQ 音乐', count: 2 })
  })

  it('按天切片出最近 7 天，缺数据的日子补 0', () => {
    const events = [
      { type: 'complete', duration: 60, at: at(0) },
      { type: 'complete', duration: 60, at: at(0) },
      { type: 'skip', duration: 100, position: 40, at: at(6) }
    ]
    const trend = dailyTrend(events, { now: at(6), days: 7 })
    expect(trend).toHaveLength(7)
    expect(trend[0].seconds).toBe(120)
    expect(trend[6].seconds).toBe(40)
    expect(trend[3].seconds).toBe(0)
  })

  it('时长格式化', () => {
    expect(formatSeconds(0)).toBe('0 分 0 秒')
    expect(formatSeconds(95)).toBe('1 分 35 秒')
    expect(formatSeconds(3725)).toBe('1 小时 2 分')
    expect(formatSeconds(undefined)).toBe('0 分 0 秒')
  })
})

describe('收听统计仓库', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('只接受 play/skip/complete/error，非法输入不入账', () => {
    const store = useStatsStore()
    expect(store.record({ type: 'play', title: 'A' })).toMatchObject({ type: 'play', title: 'A' })
    expect(store.record({ type: 'unknown' })).toBeNull()
    expect(store.record('nope')).toBeNull()
    expect(store.events).toHaveLength(1)
    // 标题/艺人截断，避免把整段歌词之类的东西写进统计
    store.record({ type: 'play', title: 'x'.repeat(500), artist: 'y'.repeat(500) })
    expect(store.events[1].title).toHaveLength(120)
    expect(store.events[1].artist).toHaveLength(120)
  })

  it('事件写入 localStorage 并能被新实例读出，超过上限时环形裁剪', () => {
    const store = useStatsStore()
    for (let i = 0; i < PLAY_STATS_MAX_EVENTS + 50; i += 1) {
      store.record({ type: 'play', title: `song-${i}`, at: at() })
    }
    expect(store.events).toHaveLength(PLAY_STATS_MAX_EVENTS)
    expect(store.events[0].title).toBe('song-50')

    store.flush() // 写盘是节流的，导出/离开页面前显式落盘
    setActivePinia(createPinia())
    const reloaded = useStatsStore()
    expect(reloaded.events).toHaveLength(PLAY_STATS_MAX_EVENTS)
    expect(reloaded.total.plays).toBe(PLAY_STATS_MAX_EVENTS)
  })

  it('今日/近 7 天切片与趋势可用，清空后归零', () => {
    const store = useStatsStore()
    const now = Date.now()
    const day = 86400000
    store.record({ type: 'complete', title: 'A', duration: 100, at: now }) // 今天
    store.record({ type: 'skip', title: 'B', duration: 100, position: 20, at: now - 3 * day }) // 3 天前
    store.record({ type: 'complete', title: 'C', duration: 100, at: now - 20 * day }) // 20 天前
    expect(store.today.seconds).toBe(100)
    expect(store.last7Days.seconds).toBe(120)
    expect(store.total.seconds).toBe(220)
    expect(store.trend).toHaveLength(7)

    store.clear()
    expect(store.events).toEqual([])
    expect(store.total.plays).toBe(0)
    setActivePinia(createPinia())
    expect(useStatsStore().events).toEqual([]) // 清空的写盘是同步的，立即生效
  })

  it('localStorage 里是脏数据时不炸，降级为空统计', () => {
    localStorage.setItem('mh_play_stats_v1', '{ not json')
    setActivePinia(createPinia())
    const store = useStatsStore()
    expect(store.events).toEqual([])
    expect(store.total.plays).toBe(0)
  })
})

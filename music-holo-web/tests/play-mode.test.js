import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MODES, PLAY_STATS_LIMIT, normalizePlayStats, usePlayerStore } from '../src/store/player.js'
import { heartWeight, nextHeartIndex, nextShuffleIndex, pickWeightedIndex, shuffleList } from '../src/utils/playMode.js'

const song = (id, title) => ({
  id,
  title,
  singerName: '演示歌手',
  album: '演示专辑',
  cover: '',
  duration: 240,
  audioUrl: `/audio/${id}.wav`
})

/** 固定序列的伪随机，保证单测可复现。 */
function seededRandom(seed = 1) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

const noSkip = () => false

describe('播放模式：不重复随机 / 心动模式', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('模式清单包含新增的两种模式，且循环顺序稳定', () => {
    expect(MODES.map((mode) => mode.key)).toEqual(['order', 'loop', 'single', 'random', 'shuffle', 'heart'])

    const store = usePlayerStore()
    store.playAll([song(1, 'a'), song(2, 'b'), song(3, 'c')], 1)
    const seen = []
    for (let i = 0; i < MODES.length; i++) {
      store.toggleMode()
      seen.push(store.mode)
    }
    expect(seen).toEqual(['loop', 'single', 'random', 'shuffle', 'heart', 'order'])
  })

  it('不重复随机在一轮内不会重复，抽完自动重洗', () => {
    const store = usePlayerStore()
    const songs = [1, 2, 3, 4, 5].map((id) => song(id, `s${id}`))
    store.playAll(songs, 1)
    store.setMode('shuffle')

    const firstRound = []
    for (let i = 0; i < 4; i++) {
      store.next()
      firstRound.push(store.currentSong.id)
    }
    expect(new Set(firstRound).size).toBe(4)
    expect(firstRound).not.toContain(1)

    // 一轮抽完后再抽会重开一轮（不会卡住不播）。
    store.next()
    expect(store.currentSong).toBeTruthy()
  })

  it('不重复随机跳过“不喜欢”的曲目，队列变化后随机袋自动失效重洗', () => {
    const queue = [song(1, 'a'), song(2, 'b'), song(3, 'c')]
    const skipSecond = (item) => item?.id === 2
    let bag = []
    const picks = []
    for (let i = 0; i < 6; i++) {
      const result = nextShuffleIndex({ queue, currentIndex: picks.at(-1) ?? 0, bag, rules: {}, isSkipped: skipSecond, random: seededRandom(i + 3) })
      bag = result.bag
      if (result.index != null) picks.push(result.index)
    }
    // 下标 1（id=2）永远不会被抽到。
    expect(picks).not.toContain(1)
  })

  it('心动模式按收藏与播放统计加权，收藏的曲目更容易被抽到', () => {
    const store = usePlayerStore()
    const songs = [1, 2, 3, 4, 5, 6].map((id) => song(id, `s${id}`))
    store.playAll(songs, 1)
    store.setFavoriteIds([3])
    for (let i = 0; i < 6; i++) store.recordPlayEvent(3, 'completed')
    store.setMode('heart')

    const counts = {}
    for (let i = 0; i < 40; i++) {
      const { index } = store.nextStatefulIndex()
      const id = store.queue[index]?.id
      counts[id] = (counts[id] || 0) + 1
    }
    const favoritePicks = counts[3] || 0
    const others = Object.entries(counts).filter(([id]) => Number(id) !== 3).map(([, value]) => value)
    const averageOther = others.reduce((sum, value) => sum + value, 0) / Math.max(1, others.length)
    expect(favoritePicks).toBeGreaterThan(averageOther)
    expect(Object.keys(counts)).not.toContain(String(store.currentSong?.id))
  })

  it('心动模式在没有收藏与统计时退化为等概率随机', () => {
    const store = usePlayerStore()
    store.playAll([song(1, 'a'), song(2, 'b'), song(3, 'c')], 1)
    store.setMode('heart')
    const picked = new Set()
    for (let i = 0; i < 20; i++) picked.add(store.nextStatefulIndex().index)
    expect(picked.size).toBeGreaterThan(1)
  })

  it('换模式会清空随机袋，打乱/去重队列也会重开一轮', () => {
    const store = usePlayerStore()
    store.playAll([song(1, 'a'), song(2, 'b'), song(3, 'c')], 1)
    store.setMode('shuffle')
    store.next()
    expect(store.shuffleBag.length).toBeGreaterThan(0)

    store.setMode('random')
    expect(store.shuffleBag).toEqual([])

    store.setMode('shuffle')
    store.next()
    expect(store.shuffleBag.length).toBeGreaterThan(0)
    store.shuffleQueue()
    expect(store.shuffleBag).toEqual([])
  })

  it('播放统计只留最近的一批，非法数据被丢弃', () => {
    const store = usePlayerStore()
    store.recordPlayEvent(1, 'completed')
    store.recordPlayEvent(1)
    store.recordPlayEvent(2, 'skipped')
    expect(store.playStats['1'].count).toBe(2)
    expect(store.playStats['1'].completed).toBe(1)
    expect(store.playStats['2'].skipped).toBe(1)

    // 空 id 与未知类型不会写脏数据。
    expect(store.recordPlayEvent(null)).toBeNull()
    expect(store.recordPlayEvent('', 'completed')).toBeNull()
    expect(store.playStats[''] ).toBeUndefined()

    const many = {}
    for (let i = 0; i < PLAY_STATS_LIMIT + 50; i++) many[`song-${i}`] = { count: i, updatedAt: i }
    const normalized = normalizePlayStats(many)
    expect(Object.keys(normalized).length).toBe(PLAY_STATS_LIMIT)
    // 保留的是 updatedAt 最大的那批。
    expect(normalized[`song-${PLAY_STATS_LIMIT + 49}`]).toBeTruthy()
    expect(normalized['song-0']).toBeUndefined()
    expect(normalizePlayStats(null)).toEqual({})
  })

  it('权重挑选与洗牌是纯函数：随机源可控', () => {
    expect(pickWeightedIndex([0, 0, 0], () => 0)).toBe(0)
    expect(pickWeightedIndex([0, 0, 0], () => 0.99)).toBe(2)
    expect(pickWeightedIndex([1, 0, 0], () => 0.5)).toBe(0)
    expect(pickWeightedIndex([0, 0, 5], () => 0.9)).toBe(2)
    expect(pickWeightedIndex([], () => 0.5)).toBe(-1)
    // 权重全为 0 / 非法值时退化为等概率抽取（不抛错、不返回 -1）。
    expect(pickWeightedIndex(['x', null], () => 0)).toBe(0)
    expect(pickWeightedIndex(['x', null], () => 0.5)).toBe(1)

    const list = [1, 2, 3, 4, 5]
    const shuffled = shuffleList(list, seededRandom(7))
    expect(shuffled.slice().sort()).toEqual(list)
    expect(shuffleList(null)).toEqual([])

    expect(nextHeartIndex({ entries: [] })).toBeNull()
    expect(nextHeartIndex({ entries: [{ index: 4, weight: 1 }] })).toBe(4)
    expect(heartWeight({ isFavorite: true, stats: { count: 10, completed: 10 } })).toBeGreaterThan(
      heartWeight({ isFavorite: false, stats: { count: 0, skipped: 5 } })
    )
    expect(heartWeight({ stats: { skipped: 100 } })).toBeGreaterThan(0)
  })
})

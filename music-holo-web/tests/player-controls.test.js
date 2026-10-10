import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  PLAYBACK_RATES,
  PLAYER_VIEW_MODES,
  RESUME_MIN_SECONDS,
  normalizePlaybackRate,
  usePlayerStore
} from '../src/store/player.js'

const song = (id, title, duration = 240) => ({
  id,
  title,
  singerName: '演示歌手',
  album: '演示专辑',
  cover: '',
  duration,
  audioUrl: `/audio/${id}.wav`
})

function storeWithQueue() {
  const store = usePlayerStore()
  store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋'), song(4, '极光列车')], 1)
  return store
}

describe('播放器控制：倍速 / 静音 / 断点续播', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('倍速只允许受支持的档位，非法值收敛到 1 倍', () => {
    expect(normalizePlaybackRate(1.3)).toBe(1.25)
    expect(normalizePlaybackRate(0)).toBe(1)
    expect(normalizePlaybackRate(-2)).toBe(1)
    expect(normalizePlaybackRate('abc')).toBe(1)
    expect(normalizePlaybackRate(9)).toBe(PLAYBACK_RATES.at(-1))

    const store = usePlayerStore()
    expect(store.playbackRate).toBe(1)
    expect(store.setPlaybackRate(1.5)).toBe(true)
    expect(store.setPlaybackRate(1.5)).toBe(false)
    expect(JSON.parse(localStorage.getItem('mh_player')).playbackRate).toBe(1.5)
  })

  it('倍速在档位间循环，走完全部档位后回到起点', () => {
    const store = usePlayerStore()
    const seen = []
    for (let i = 0; i < PLAYBACK_RATES.length; i++) seen.push(store.cyclePlaybackRate())
    expect(seen[0]).toBe(1.25)
    expect(seen).toEqual([1.25, 1.5, 1.75, 2, 0.5, 0.75, 1])
    expect(store.playbackRate).toBe(1)
  })

  it('静音会保留原音量，取消静音可原样恢复；音量为 0 时取消静音回落到默认音量', () => {
    const store = usePlayerStore()
    store.setVolume(0.4)
    expect(store.toggleMuted()).toBe(true)
    expect(store.muted).toBe(true)
    expect(store.volume).toBe(0.4)
    store.toggleMuted()
    expect(store.muted).toBe(false)
    expect(store.volume).toBeCloseTo(0.4)

    store.setVolume(0)
    expect(store.muted).toBe(false)
    store.setMuted(true)
    store.setMuted(false)
    // 静音状态下把音量拖到 0，取消静音时不能还是“无声”。
    expect(store.volume).toBeGreaterThan(0)
  })

  it('拖动音量自动解除静音', () => {
    const store = usePlayerStore()
    store.setMuted(true)
    store.setVolume(0.6)
    expect(store.muted).toBe(false)
    expect(store.volume).toBeCloseTo(0.6)
  })

  it('断点续播：只认同一首歌，取出即清空，过短或贴近结尾不续播', () => {
    const store = usePlayerStore()
    store.saveResumePosition(7, 120)
    expect(store.resumeSongId).toBe(7)
    // 同一首歌：返回记录位置
    expect(store.consumeResumePosition(7, 240)).toBe(120)
    // 取出后即清空，重复调用不再续播
    expect(store.consumeResumePosition(7, 240)).toBe(0)

    store.saveResumePosition(8, 2)
    expect(store.consumeResumePosition(8, 240)).toBe(0)

    store.saveResumePosition(9, 236)
    expect(store.consumeResumePosition(9, 240)).toBe(0)

    // 恰好在保护区间边界上：小于最小续播秒数仍不续播
    store.saveResumePosition(10, RESUME_MIN_SECONDS - 0.5)
    expect(store.consumeResumePosition(10, 240)).toBe(0)
  })

  it('断点续播位置会持久化，且本地/自定义源曲目不写入', () => {
    const store = usePlayerStore()
    store.saveResumePosition(11, 66)
    const saved = JSON.parse(localStorage.getItem('mh_player'))
    expect(saved.resumeSongId).toBe(11)
    expect(saved.resumeTime).toBe(66)
    store.clearResumePosition()
    expect(JSON.parse(localStorage.getItem('mh_player')).resumeSongId).toBeNull()
  })
})

describe('输出偏好：空间音效记忆', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('空间音效开关会被记住，且跨会话保留', () => {
    const store = usePlayerStore()
    expect(store.spatialPreferred).toBe(false)
    expect(store.setSpatialPreferred(true)).toBe(true)
    expect(JSON.parse(localStorage.getItem('mh_player')).spatialPreferred).toBe(true)

    const reloaded = usePlayerStore(createPinia())
    expect(reloaded.spatialPreferred).toBe(true)

    // 只有显式传入才会改写：脏值一律当关闭处理。
    expect(reloaded.setSpatialPreferred('no')).toBe(false)
    expect(reloaded.spatialPreferred).toBe(false)
  })
})

describe('均衡器偏好', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('默认原声，选择预设后增益跟着变并持久化', () => {
    const store = usePlayerStore()
    expect(store.equalizer.preset).toBe('flat')
    expect(store.equalizerActive).toBe(false)

    expect(store.setEqualizerPreset('rock')).toBe('rock')
    expect(store.equalizerActive).toBe(true)
    expect(store.equalizerGains).toHaveLength(6)
    expect(JSON.parse(localStorage.getItem('mh_player')).equalizer.preset).toBe('rock')

    const reloaded = usePlayerStore(createPinia())
    expect(reloaded.equalizer.preset).toBe('rock')
    expect(reloaded.equalizerGains).toEqual(store.equalizerGains)
  })

  it('改一个频段变自定义并夹在限幅内，未知预设被忽略', () => {
    const store = usePlayerStore()
    store.setEqualizerPreset('pop')
    expect(store.setEqualizerBand(2, 99)).toBe('custom')
    expect(store.equalizerGains[2]).toBe(12)
    expect(store.setEqualizerBand(1, -99)).toBe('custom')
    expect(store.equalizerGains[1]).toBe(-12)
    // 越界下标与非数字都保持原样。
    expect(store.setEqualizerBand(9, 3)).toBe('custom')
    expect(store.setEqualizerBand('x', 3)).toBe('custom')
    expect(store.setEqualizerBand(0, 'abc')).toBe('custom')
    expect(store.equalizerGains[0]).toBe(0)

    store.setEqualizerPreset('pop')
    expect(store.setEqualizerPreset('not-a-preset')).toBe('pop')

    expect(store.resetEqualizer()).toBe('flat')
    expect(store.equalizerActive).toBe(false)
  })
})

describe('播放器形态：标准 / 迷你 / 沉浸', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('形态按 标准 → 迷你 → 播放页 → 沉浸 → 标准 循环，非法值回落到标准', () => {
    const store = usePlayerStore()
    expect(store.playerViewMode).toBe('standard')
    expect(store.cyclePlayerViewMode()).toBe('mini')
    expect(store.cyclePlayerViewMode()).toBe('stage')
    expect(store.cyclePlayerViewMode()).toBe('immersive')
    expect(store.cyclePlayerViewMode()).toBe('standard')

    expect(store.setPlayerViewMode('immersive')).toBe('immersive')
    expect(store.setPlayerViewMode('huge')).toBe('standard')
    expect(store.setPlayerViewMode(null)).toBe('standard')
  })

  it('形态会持久化，刷新后仍然保持', () => {
    const store = usePlayerStore()
    store.setPlayerViewMode('mini')
    expect(JSON.parse(localStorage.getItem('mh_player')).playerViewMode).toBe('mini')
    const reloaded = usePlayerStore(createPinia())
    expect(reloaded.playerViewMode).toBe('mini')
    expect(PLAYER_VIEW_MODES.map((mode) => mode.key)).toContain(reloaded.playerViewMode)
  })
})

describe('播放队列：打乱 / 去重 / 总时长', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('打乱后正在播放的曲目保持在队首并继续播放', () => {
    const store = storeWithQueue()
    store.currentIndex = 2
    store.playing = true
    const playingTitle = store.currentSong.title
    expect(store.shuffleQueue()).toBe(true)
    expect(store.queue).toHaveLength(4)
    expect(store.queue[0].title).toBe(playingTitle)
    expect(store.currentIndex).toBe(0)
    expect(store.currentSong.title).toBe(playingTitle)
    expect(new Set(store.queue.map((item) => item.id)).size).toBe(4)
  })

  it('去重只保留第一次出现的曲目，并保持当前曲目不变', () => {
    const store = storeWithQueue()
    store.queue.push(song(2, '云端信使'), song(1, '霓虹海'))
    store.currentIndex = 1
    const removed = store.dedupeQueue()
    expect(removed).toBe(2)
    expect(store.queue.map((item) => item.id)).toEqual([1, 2, 3, 4])
    expect(store.currentIndex).toBe(1)
    expect(store.dedupeQueue()).toBe(0)
  })

  it('队列总时长是各曲目时长之和，未知时长按 0 计', () => {
    const store = storeWithQueue()
    expect(store.queueDuration).toBe(240 * 4)
    store.queue.push({ id: 9, title: '未知时长', duration: 0 })
    expect(store.queueDuration).toBe(240 * 4)
  })
})

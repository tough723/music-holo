import { describe, expect, it } from 'vitest'
import {
  DETERMINISTIC_NEXT_MODES,
  METERED_EFFECTIVE_TYPES,
  nextPreloadIndex,
  shouldPreloadNext
} from '../src/utils/audioPreload.js'

const queue = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('下一首元数据预取策略', () => {
  it('只在「下一首确定」的模式里算出下标', () => {
    for (const mode of DETERMINISTIC_NEXT_MODES) {
      expect(nextPreloadIndex(queue, 0, mode)).toBe(1)
    }
    // 列表循环绕回队首，顺序播放到队尾就没有下一首
    expect(nextPreloadIndex(queue, 2, 'loop')).toBe(0)
    // 单曲循环与随机类模式：下一首不确定
    expect(nextPreloadIndex(queue, 0, 'single')).toBe(-1)
    expect(nextPreloadIndex(queue, 0, 'random')).toBe(-1)
    expect(nextPreloadIndex(queue, 0, 'shuffle')).toBe(-1)
    expect(nextPreloadIndex(queue, 0, 'heart')).toBe(-1)
    // 边界：空队列、越界下标、少于两首
    expect(nextPreloadIndex([], 0, 'order')).toBe(-1)
    expect(nextPreloadIndex(queue, 9, 'order')).toBe(-1)
    expect(nextPreloadIndex(queue, -1, 'order')).toBe(-1)
    expect(nextPreloadIndex([{ id: 1 }], 0, 'order')).toBe(-1)
    expect(nextPreloadIndex(null, 0, 'order')).toBe(-1)
  })

  it('省流量、极慢网络、本地文件与自定义源都不预取', () => {
    const base = { hasNext: true, isRemote: true }
    expect(shouldPreloadNext(base)).toBe(true)
    expect(shouldPreloadNext({ ...base, saveData: true })).toBe(false)
    for (const type of METERED_EFFECTIVE_TYPES) {
      expect(shouldPreloadNext({ ...base, effectiveType: type })).toBe(false)
    }
    expect(shouldPreloadNext({ ...base, effectiveType: '4g' })).toBe(true)
    expect(shouldPreloadNext({ ...base, isLocal: true })).toBe(false)
    expect(shouldPreloadNext({ ...base, isCustomSource: true })).toBe(false)
    expect(shouldPreloadNext({ ...base, isRemote: false })).toBe(false) // blob / 本地地址
    expect(shouldPreloadNext({ ...base, hasNext: false })).toBe(false)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { LYRIC_OFFSET_LIMIT_MS } from '../src/store/player.js'
import { createPinia, setActivePinia } from 'pinia'
import { LYRIC_FIX_LIMIT_MS, LYRIC_FIX_MIN_REPORTS, useLyricFixStore } from '../src/store/lyricFix.js'

describe('歌词时间轴校正账本', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('保存与覆盖：按歌曲 id 去重，偏移收敛到 ±10 秒', () => {
    const store = useLyricFixStore()
    const first = store.saveCorrection({ songId: 7, title: '雨港', artist: '甲', offsetMs: 1200 })
    expect(first).toMatchObject({ offsetMs: 1200, submitted: false })

    const second = store.saveCorrection({ songId: 7, title: '雨港', artist: '甲', offsetMs: 800 })
    expect(second).toMatchObject({ offsetMs: 800 })
    expect(Object.keys(store.corrections)).toEqual(['7'])

    expect(store.saveCorrection({ songId: 8, offsetMs: LYRIC_FIX_LIMIT_MS + 5000 }).offsetMs).toBe(LYRIC_FIX_LIMIT_MS)
    expect(store.saveCorrection({ songId: 9, offsetMs: -LYRIC_FIX_LIMIT_MS - 5000 }).offsetMs).toBe(-LYRIC_FIX_LIMIT_MS)
    expect(store.saveCorrection({ songId: 10, offsetMs: 'abc' }).offsetMs).toBe(0)
    expect(store.saveCorrection({ songId: null })).toBeNull()
  })

  it('落盘后能被新实例读出，脏数据降级为空账本', () => {
    const store = useLyricFixStore()
    store.saveCorrection({ songId: 7, title: '雨港', offsetMs: 500 })
    setActivePinia(createPinia())
    const reloaded = useLyricFixStore()
    expect(reloaded.correctionFor(7)).toMatchObject({ title: '雨港', offsetMs: 500 })
    expect(reloaded.correctionFor('7')).toBeTruthy() // 数字/字符串 id 都认
    expect(reloaded.correctionFor(999)).toBeNull()

    localStorage.setItem('mh_lyric_fix_v1', 'not json')
    setActivePinia(createPinia())
    expect(useLyricFixStore().corrections).toEqual({})
  })

  it('pending 只统计有偏移且未提交的校正，提交成功后移出待办', () => {
    const store = useLyricFixStore()
    store.saveCorrection({ songId: 1, title: 'A', offsetMs: 300 })
    store.saveCorrection({ songId: 2, title: 'B', offsetMs: 0 }) // 归零：不待提交
    store.saveCorrection({ songId: 3, title: 'C', offsetMs: 400, submitted: true }) // 已提交
    expect(store.pendingCount).toBe(1)
    expect(store.pending[0].title).toBe('A')

    expect(store.markSubmitted(1)).toMatchObject({ submitted: true })
    expect(store.pendingCount).toBe(0)
    expect(store.markSubmitted(404)).toBeNull()
  })

  it('删除与清空都会同步落盘', () => {
    const store = useLyricFixStore()
    store.saveCorrection({ songId: 1, title: 'A', offsetMs: 300 })
    store.saveCorrection({ songId: 2, title: 'B', offsetMs: 300 })
    store.removeCorrection(1)
    expect(store.correctionFor(1)).toBeNull()
    setActivePinia(createPinia())
    expect(useLyricFixStore().correctionFor(1)).toBeNull()

    store.clear()
    expect(store.exportCorrections()).toEqual([])
    setActivePinia(createPinia())
    expect(useLyricFixStore().corrections).toEqual({})
  })

  it('导出的是副本，改动不会污染账本', () => {
    const store = useLyricFixStore()
    store.saveCorrection({ songId: 1, title: 'A', offsetMs: 300 })
    const exported = store.exportCorrections()
    exported[0].offsetMs = 9999
    expect(store.correctionFor(1).offsetMs).toBe(300)
  })

  it('校正范围与播放器时间校准的上下限一致', () => {
    expect(LYRIC_FIX_LIMIT_MS).toBe(LYRIC_OFFSET_LIMIT_MS)
    expect(LYRIC_FIX_MIN_REPORTS).toBe(3) // 少于 3 份上报不下发为默认值
  })
})

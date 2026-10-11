import { describe, expect, it } from 'vitest'
import {
  describeQueueSaveResult,
  isQueueSongSavable,
  partitionQueueForPlaylist,
  suggestQueuePlaylistName
} from '../src/utils/queueToPlaylist.js'

describe('队列存为歌单', () => {
  it('只有曲库里的歌能进歌单，本地与自定义源跳过', () => {
    expect(isQueueSongSavable({ id: 1 })).toBe(true)
    expect(isQueueSongSavable({ id: '7' })).toBe(true) // 后端返回字符串 id 也算
    expect(isQueueSongSavable({ id: 0 })).toBe(false)
    expect(isQueueSongSavable({ id: -3 })).toBe(false)
    expect(isQueueSongSavable({ id: 1.5 })).toBe(false)
    expect(isQueueSongSavable({ id: 1, isLocal: true })).toBe(false)
    expect(isQueueSongSavable({ id: 1, isCustomSource: true })).toBe(false)
    expect(isQueueSongSavable(null)).toBe(false)
    expect(isQueueSongSavable({})).toBe(false)
  })

  it('拆队列时去重并保持顺序', () => {
    const queue = [
      { id: 3, title: 'C' },
      { id: 1, title: 'A', isLocal: true },
      { id: 2, title: 'B' },
      { id: 3, title: 'C 重复' },
      { id: 'x', title: '自定义' , isCustomSource: true }
    ]
    const { ids, skipped, savableCount } = partitionQueueForPlaylist(queue)
    expect(ids).toEqual([3, 2])
    expect(savableCount).toBe(2)
    expect(skipped.map((s) => s.title)).toEqual(['A', '自定义'])
    expect(skipped).toHaveLength(2)
    expect(partitionQueueForPlaylist(null).ids).toEqual([])
    expect(partitionQueueForPlaylist([]).skipped).toEqual([])
  })

  it('默认歌单名带时间，多次保存不重名', () => {
    const first = suggestQueuePlaylistName([{ id: 1 }], new Date(2026, 9, 10, 9, 5))
    const second = suggestQueuePlaylistName([{ id: 1 }], new Date(2026, 9, 10, 21, 30))
    expect(first).toBe('我的队列 · 1010 0905（1首）') // 2026-10-10 09:05
    expect(second).not.toBe(first)
    expect(suggestQueuePlaylistName([], new Date(2026, 0, 2, 3, 4))).toBe('我的队列 · 0102 0304')
    expect(suggestQueuePlaylistName([], '坏日期')).toContain('我的队列 · ')
  })

  it('保存结果如实报数：漏存、未收录、跳过都要说清楚', () => {
    expect(describeQueueSaveResult({ name: '队列', requested: 3, added: 3 }))
      .toEqual({ type: 'success', text: '已存入歌单《队列》3 首' })
    expect(describeQueueSaveResult({ name: '队列', requested: 3, added: 2 }).type).toBe('warning')
    expect(describeQueueSaveResult({ name: '队列', requested: 3, added: 2 }).text)
      .toBe('已存入歌单《队列》2 首，另有 1 首服务端未收录')
    expect(describeQueueSaveResult({ name: '队列', requested: 2, added: 2, skippedCount: 1 }).text)
      .toBe('已存入歌单《队列》2 首，1 首本地/自定义源歌曲不上传')
    const empty = describeQueueSaveResult({ name: '队列', requested: 3, added: 0 })
    expect(empty.type).toBe('warning')
    expect(empty.text).toContain('一首都没存进去')
    expect(describeQueueSaveResult({ name: '队列', added: undefined }).type).toBe('warning')
  })
})

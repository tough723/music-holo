import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { findAdvanceIndex, isSkippedByDislike } from '@/utils/dislikeSkip'
import { usePlayerStore } from '@/store/player'
import { useDislikeStore } from '@/store/dislike'
import * as lyricApi from '@/api/lyric'
import * as songApi from '@/api/song'

const song = (id, singerId, extra = {}) => ({ id, singerId, title: `歌曲${id}`, ...extra })

describe('不喜欢规则的自动切歌', () => {
  it('按歌曲或歌手跳过，但保留本地文件和空歌手', () => {
    const rules = { songIds: ['2'], singerIds: [5] }
    expect(isSkippedByDislike(song(2, 1), rules)).toBe(true)
    expect(isSkippedByDislike(song(8, 5), rules)).toBe(true)
    expect(isSkippedByDislike(song(1, null), rules)).toBe(false)
    expect(isSkippedByDislike(song('local-1', 5, { isLocal: true }), rules)).toBe(false)
    expect(isSkippedByDislike(song(2, 1, { isCustomSource: true }), rules)).toBe(true)
  })

  it('顺序和循环会跳过屏蔽项，随机只在未屏蔽曲目中选择', () => {
    const queue = [song(1, 1), song(2, 1), song(3, 9), song(4, 5)]
    const rules = { songIds: [2], singerIds: [5] }

    expect(findAdvanceIndex(queue, 0, 1, 'order', rules)).toEqual({ index: 2, skippedCount: 1 })
    expect(findAdvanceIndex(queue, 2, 1, 'order', rules)).toEqual({ index: null, skippedCount: 1 })
    expect(findAdvanceIndex(queue, 2, 1, 'loop', rules)).toEqual({ index: 0, skippedCount: 1 })
    expect(findAdvanceIndex(queue, 0, -1, 'order', rules)).toEqual({ index: null, skippedCount: 0 })
    expect(findAdvanceIndex(queue, 0, 1, 'random', rules, () => 0)).toEqual({ index: 2, skippedCount: 0 })
  })
})

describe('播放器消费不喜欢规则', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
  })

  it('自动下一首跳过屏蔽歌曲，但用户指定的下一首和显式点播仍播放', async () => {
    const dislike = useDislikeStore()
    dislike.songIds = [2]
    dislike.singerIds = [5]
    const player = usePlayerStore()
    player.queue = [song(1, 1), song(2, 1), song(3, 9), song(4, 5)]
    player.currentIndex = 0
    player.mode = 'order'

    await player.next()
    expect(player.currentSong).toMatchObject({ id: 3 })

    await player.playAt(1)
    expect(player.currentSong).toMatchObject({ id: 2 })

    player.playNext(song(4, 5))
    await player.next()
    expect(player.currentSong).toMatchObject({ id: 4 })
    expect(player.priorityNextSongId).toBe(null)
  })

  it('后面都已屏蔽时停止，而不是循环播放屏蔽曲目', async () => {
    const dislike = useDislikeStore()
    dislike.songIds = [2]
    const player = usePlayerStore()
    player.queue = [song(1, 1), song(2, 1)]
    player.currentIndex = 0
    player.playing = true
    player.mode = 'order'

    const status = await player.next()
    expect(status).toMatchObject({ played: false, blocked: true, skippedCount: 1 })
    expect(player.currentSong).toMatchObject({ id: 1 })
    expect(player.playing).toBe(false)
  })

  it('没有规则时保持原来的顺序切歌', async () => {
    const player = usePlayerStore()
    player.queue = [song(1, 1), song(2, 2)]
    player.currentIndex = 0
    player.mode = 'order'

    await player.next()
    expect(player.currentSong).toMatchObject({ id: 2 })
  })
})

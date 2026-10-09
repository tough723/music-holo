import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/user'
import { usePlayerStore } from '@/store/player'
import * as authApi from '@/api/auth'
import * as albumApi from '@/api/album'
import * as commonApi from '@/api/common'
import * as favoriteApi from '@/api/favorite'
import * as lyricApi from '@/api/lyric'
import * as playlistApi from '@/api/playlist'
import * as queueApi from '@/api/queue'
import * as searchApi from '@/api/search'
import * as recommendationApi from '@/api/recommend'
import * as reviewApi from '@/api/review'
import * as historyApi from '@/api/history'
import * as songApi from '@/api/song'
import * as systemApi from '@/api/system'
import * as userApi from '@/api/user'
import { useThemeStore, THEMES } from '@/store/theme'
import { buildPublicPlaylistShareUrl, shareOrCopy } from '@/utils/share'

// API 错误仍由 Mock 层抛出；只屏蔽 UI 通知，避免测试输出污染。
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

async function loginAs(username = 'demo') {
  return useUserStore().login({ username, password: '123456' })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('scrollTo', vi.fn())
  setActivePinia(createPinia())
})

afterEach(() => {
  usePlayerStore().cancelSleepTimer()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('公开歌单分享', () => {
  it('只为公开歌单生成同源链接', () => {
    const router = { resolve: vi.fn(() => ({ href: '/playlists/42' })) }

    expect(buildPublicPlaylistShareUrl({ id: 42, isPublic: 0 }, router, 'https://music.test')).toBe(null)
    expect(buildPublicPlaylistShareUrl({ id: 42, isPublic: 1 }, router, 'https://music.test'))
      .toBe('https://music.test/playlists/42')
    expect(router.resolve).toHaveBeenCalledWith({ name: 'PlaylistDetail', params: { id: 42 } })

    const externalRouter = { resolve: () => ({ href: 'https://outside.test/playlists/42' }) }
    expect(buildPublicPlaylistShareUrl({ id: 42, isPublic: 1 }, externalRouter, 'https://music.test')).toBe(null)
  })

  it('优先调起系统分享，用户主动取消时不误报失败', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const data = { title: '夜航', text: '来听听', url: 'https://music.test/playlists/42' }
    const environment = { navigator: { share }, document: {}, isSecureContext: true }

    await expect(shareOrCopy(data, environment)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(data)

    share.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    await expect(shareOrCopy(data, environment)).resolves.toBe('cancelled')
  })

  it('无原生分享时先用 Clipboard API，失败后尝试兼容复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const environment = { navigator: { clipboard: { writeText } }, isSecureContext: true }
    const data = { url: 'https://music.test/playlists/42' }

    await expect(shareOrCopy(data, environment)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(data.url)

    const field = {
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn()
    }
    const legacyEnvironment = {
      navigator: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) } },
      isSecureContext: true,
      document: {
        body: { appendChild: vi.fn() },
        createElement: vi.fn(() => field),
        execCommand: vi.fn(() => true)
      }
    }
    await expect(shareOrCopy(data, legacyEnvironment)).resolves.toBe('copied')
    expect(legacyEnvironment.document.execCommand).toHaveBeenCalledWith('copy')
    expect(field.remove).toHaveBeenCalledOnce()
  })
})

describe('本地音乐播放', () => {
  it('音频只用临时 Blob URL 播放，不调用后端或持久化本地文件', async () => {
    const createObjectURL = vi.fn((file) => `blob:music/${file.name}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const playRequest = vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    const lyricRequest = vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    const player = usePlayerStore()
    const remoteSong = { id: 7, title: '远程歌曲', audioUrl: '/audio/song7.wav' }
    player.queue = [remoteSong]
    player.currentIndex = 0

    const files = [
      new File(['local audio'], 'night.wav', { type: 'audio/wav' }),
      new File(['not audio'], 'notes.txt', { type: 'text/plain' })
    ]
    const result = player.addLocalFiles(files)

    expect(result).toMatchObject({ count: 1, startIndex: 1, skipped: 1 })
    expect(player.queue[1]).toMatchObject({ title: 'night', singerName: '本地文件', isLocal: true })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(JSON.parse(localStorage.getItem('mh_player'))).toMatchObject({
      queue: [remoteSong],
      currentIndex: 0
    })

    await player.playAt(result.startIndex)
    expect(player.currentSong.isLocal).toBe(true)
    expect(JSON.parse(localStorage.getItem('mh_player')).currentIndex).toBe(-1)
    expect(playRequest).not.toHaveBeenCalled()
    expect(lyricRequest).not.toHaveBeenCalled()

    player.playing = false
    player.removeAt(result.startIndex)
    await Promise.resolve()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:music/night.wav')
  })

  it('曲库歌曲独立加载译文，并在切换到无译文曲目时清空旧内容', async () => {
    vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    vi.spyOn(lyricApi, 'parse')
      .mockResolvedValueOnce({
        lines: [{ time: 0.5, text: '原歌词' }],
        translationLines: [{ time: 0.5, text: 'translated lyric' }]
      })
      .mockResolvedValueOnce({ lines: [{ time: 1, text: '下一首' }], translationLines: [] })
    const player = usePlayerStore()

    await player.playSong({ id: 501, title: '双语测试' })
    expect(player.lyrics).toEqual([{ time: 0.5, text: '原歌词' }])
    expect(player.lyricTranslations).toEqual([{ time: 0.5, text: 'translated lyric' }])

    await player.playSong({ id: 502, title: '无译文测试' })
    expect(player.lyricTranslations).toEqual([])
  })

  it('自定义源曲目只在内存播放，不写入持久队列或调用后端 API', async () => {
    const playRequest = vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    const lyricRequest = vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    const customTrack = {
      id: 'custom-session-123',
      title: '隔离试听',
      audioUrl: 'https://media.example.test/signed/short-lived',
      customLyrics: [{ time: 0, text: '临时歌词' }],
      isCustomSource: true
    }
    localStorage.setItem('mh_player', JSON.stringify({ queue: [customTrack], currentIndex: 0 }))
    setActivePinia(createPinia())
    const player = usePlayerStore()
    expect(player.queue).toEqual([])
    player.queue = [customTrack]

    await player.playAt(0)

    expect(player.currentSong).toMatchObject(customTrack)
    expect(player.lyrics).toEqual(customTrack.customLyrics)
    expect(JSON.parse(localStorage.getItem('mh_player'))).toMatchObject({ queue: [], currentIndex: -1 })
    expect(localStorage.getItem('mh_player')).not.toContain('signed/short-lived')
    expect(playRequest).not.toHaveBeenCalled()
    expect(lyricRequest).not.toHaveBeenCalled()
  })

  it('清空或替换队列时释放残留的本地 Blob URL', async () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((file) => `blob:music/${file.name}`),
      revokeObjectURL
    })
    vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    const player = usePlayerStore()
    const makeFile = (name) => new File(['local audio'], name, { type: 'audio/wav' })

    player.addLocalFiles([makeFile('clear.wav')])
    player.clearQueue()
    await Promise.resolve()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:music/clear.wav')

    player.addLocalFiles([makeFile('replace.wav')])
    await player.playAll([{ id: 8, title: '替换曲目', audioUrl: '/audio/replacement.wav' }])
    await Promise.resolve()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:music/replace.wav')
  })
})

describe('播放器队列优先级与排序', () => {
  it('将选中歌曲安排为下一首，移动队列时保持当前歌曲并持久化新顺序', () => {
    const current = { id: 31, title: '当前歌曲' }
    const queuedNext = { id: 32, title: '原下一首' }
    const selected = { id: 33, title: '选择的下一首' }
    const player = usePlayerStore()
    player.queue = [current, queuedNext, selected]
    player.currentIndex = 0

    expect(player.playNext(selected)).toBe('moved')
    expect(player.queue.map((song) => song.id)).toEqual([31, 33, 32])
    expect(player.currentSong).toMatchObject({ id: current.id, title: current.title })
    expect(player.playNext(selected)).toBe('already-next')
    expect(player.playNext(current)).toBe('current')

    expect(player.moveQueueItem(1, 0)).toBe(true)
    expect(player.queue.map((song) => song.id)).toEqual([33, 31, 32])
    expect(player.currentIndex).toBe(1)
    expect(player.currentSong).toMatchObject({ id: current.id, title: current.title })
    expect(JSON.parse(localStorage.getItem('mh_player'))).toMatchObject({
      queue: [{ id: 33 }, { id: 31 }, { id: 32 }],
      currentIndex: 1
    })
  })

  it('将当前歌曲之前的已入队歌曲移到其后作为下一首', () => {
    const before = { id: 34, title: '原本在当前曲目前' }
    const current = { id: 35, title: '当前歌曲' }
    const after = { id: 36, title: '原下一首' }
    const player = usePlayerStore()
    player.queue = [before, current, after]
    player.currentIndex = 1

    expect(player.playNext(before)).toBe('moved')
    expect(player.queue.map((song) => song.id)).toEqual([35, 34, 36])
    expect(player.currentIndex).toBe(0)
    expect(player.currentSong).toMatchObject({ id: current.id })
  })

  it('指定下一首优先于随机模式一次，并能随曲库队列恢复', async () => {
    vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    const current = { id: 35, title: '随机模式当前曲目' }
    const randomPick = { id: 36, title: '随机候选' }
    const selected = { id: 37, title: '优先下一首' }
    const player = usePlayerStore()
    player.queue = [current, randomPick, selected]
    player.currentIndex = 0
    player.mode = 'random'

    expect(player.playNext(selected)).toBe('moved')
    expect(JSON.parse(localStorage.getItem('mh_player')).priorityNextSongId).toBe(selected.id)

    setActivePinia(createPinia())
    const restored = usePlayerStore()
    expect(restored.priorityNextSongId).toBe(selected.id)
    await restored.next()
    expect(restored.currentSong).toMatchObject({ id: selected.id })
    expect(restored.priorityNextSongId).toBe(null)
  })

  it('没有当前歌曲时将目标放在队首，并拒绝越界排序', () => {
    const first = { id: 41, title: '原队首' }
    const later = { id: 42, title: '稍后播放' }
    const player = usePlayerStore()
    player.queue = [first, later]
    player.currentIndex = -1

    expect(player.playNext(later)).toBe('moved')
    expect(player.queue.map((song) => song.id)).toEqual([42, 41])
    expect(player.currentIndex).toBe(-1)
    expect(player.moveQueueItem(0, 2)).toBe(false)
    expect(player.moveQueueItem(1, 1)).toBe(false)
    expect(player.playNext({ title: '没有 ID 的曲目' })).toBe('invalid')
  })

  it('下一首插入仍不把本地 Blob 或自定义源签名链接写入持久队列', () => {
    const player = usePlayerStore()
    const current = { id: 51, title: '当前曲库歌曲' }
    player.queue = [current]
    player.currentIndex = 0
    const local = { id: 'local-session-52', title: '本地歌曲', audioUrl: 'blob:private/local', isLocal: true }
    const custom = { id: 'custom-session-53', title: '自定义源歌曲', audioUrl: 'https://media.example.test/signed/secret', isCustomSource: true }

    expect(player.playNext(local)).toBe('added')
    expect(player.playNext(custom)).toBe('added')
    const persisted = localStorage.getItem('mh_player')
    expect(persisted).not.toContain('blob:private/local')
    expect(persisted).not.toContain('signed/secret')
    expect(JSON.parse(persisted)).toMatchObject({ queue: [current], currentIndex: 0 })
  })
})

describe('播放器睡眠定时', () => {
  it('倒计时到期暂停播放，并清空活动定时', () => {
    vi.useFakeTimers()
    const player = usePlayerStore()
    player.playing = true

    expect(player.setSleepTimerMinutes(15)).toBe(true)
    expect(player.sleepTimerMode).toBe('duration')
    vi.advanceTimersByTime(15 * 60 * 1000 - 1)
    expect(player.playing).toBe(true)
    vi.advanceTimersByTime(1)

    expect(player.playing).toBe(false)
    expect(player.sleepTimerMode).toBe(null)
    expect(player.sleepTimerEndAt).toBe(null)
    expect(player.sleepTimerLastFinishedAt).toBe(Date.now())
  })

  it('播完本曲后停止而不是自动进入下一首', () => {
    const player = usePlayerStore()
    player.queue = [{ id: 1, title: '当前曲目' }, { id: 2, title: '下一首' }]
    player.currentIndex = 0
    player.playing = true

    expect(player.setStopAfterCurrentSong()).toBe(true)
    expect(player.handleSleepTimerTrackEnd(2)).toBe(false)
    expect(player.handleSleepTimerTrackEnd(1)).toBe(true)
    expect(player.playing).toBe(false)
    expect(player.sleepTimerMode).toBe(null)
  })

  it('切歌会取消“播完当前歌曲”定时', async () => {
    vi.spyOn(lyricApi, 'parse').mockResolvedValue({ lines: [] })
    vi.spyOn(songApi, 'play').mockResolvedValue(undefined)
    const player = usePlayerStore()
    player.queue = [{ id: 1, title: '当前曲目' }, { id: 2, title: '下一首' }]
    player.currentIndex = 0
    player.setStopAfterCurrentSong()

    await player.playAt(1)
    expect(player.sleepTimerMode).toBe(null)
    expect(player.currentSong.id).toBe(2)
  })

  it('取消后不再暂停；不支持的时长不会覆盖当前定时', () => {
    vi.useFakeTimers()
    const player = usePlayerStore()
    player.playing = true
    player.setSleepTimerMinutes(15)
    const deadline = player.sleepTimerEndAt

    expect(player.setSleepTimerMinutes(20)).toBe(false)
    expect(player.sleepTimerEndAt).toBe(deadline)
    expect(player.cancelSleepTimer()).toBe(true)
    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(player.playing).toBe(true)
    expect(player.sleepTimerMode).toBe(null)
  })
})

describe('内置 Mock API 集成测试', () => {
  it('登录返回安全的用户资料，并能查询当前用户', async () => {
    const store = useUserStore()
    const result = await store.login({ username: 'admin', password: '123456' })

    expect(result.token).toMatch(/^mock-token-/)
    expect(result.userInfo).toMatchObject({ username: 'admin', role: 0 })
    expect(result.userInfo).not.toHaveProperty('password')
    await expect(authApi.info()).resolves.toMatchObject({ username: 'admin', role: 0 })
  })

  it('普通用户不能读取管理员统计接口', async () => {
    await loginAs('demo')
    await expect(commonApi.stats()).rejects.toMatchObject({ code: 403 })

    await useUserStore().logoutLocal()
    await loginAs('admin')
    await expect(commonApi.stats()).resolves.toMatchObject({
      userCount: 2,
      singerCount: 6,
      songCount: 8
    })
  })

  it('收藏数据按用户隔离，支持新增、检查和取消', async () => {
    await loginAs('demo')
    expect(await favoriteApi.ids()).toEqual(expect.arrayContaining([1, 4, 6]))

    await favoriteApi.add(2)
    await expect(favoriteApi.check(2)).resolves.toBe(true)

    await useUserStore().logoutLocal()
    await loginAs('admin')
    expect(await favoriteApi.ids()).toEqual([])
    await favoriteApi.add(2)
    await expect(favoriteApi.check(2)).resolves.toBe(true)

    await useUserStore().logoutLocal()
    await loginAs('demo')
    await expect(favoriteApi.check(2)).resolves.toBe(true)
    await favoriteApi.cancel(2)
    await expect(favoriteApi.check(2)).resolves.toBe(false)
  })

  it('播放队列支持批量去重、查询、移除和清空', async () => {
    await loginAs('demo')
    await queueApi.clear()
    await queueApi.add(2)
    await queueApi.addBatch([3, 4, 3])

    expect((await queueApi.getQueue()).map((song) => song.id)).toEqual([2, 3, 4])
    await queueApi.remove(3)
    expect((await queueApi.getQueue()).map((song) => song.id)).toEqual([2, 4])
    await queueApi.clear()
    expect(await queueApi.getQueue()).toEqual([])
  })

  it('歌词解析按时间排序并返回可同步显示的译文行', async () => {
    const result = await lyricApi.parse(1)
    expect(result).toMatchObject({ songId: 1, title: '霓虹海' })
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.lines[0]).toMatchObject({ time: 0.5, text: '霓虹亮起 城市开始呼吸' })
    expect(result.lines.every((line) => typeof line.time === 'number' && typeof line.text === 'string')).toBe(true)
    expect(result.translationLines[0]).toMatchObject({ time: 0.5, text: 'Neon wakes, the city starts to breathe' })
    expect(result.translationLines).toHaveLength(result.lines.length)
  })

  it('译文可独立编辑或上传；旧客户端省略字段不清除已有译文', async () => {
    await loginAs('admin')
    const original = await songApi.detail(1)
    const uploadedTranslation = '[00:00.50]Uploaded translation\n[00:02.00]Second translated line'

    try {
      const { lyricTranslation, ...legacyUpdate } = original
      await songApi.save(legacyUpdate)
      expect((await songApi.detail(1)).lyricTranslation).toBe(lyricTranslation)

      await lyricApi.save({ songId: 1, lyricTranslation: uploadedTranslation })
      await lyricApi.save({ songId: 1, lyric: original.lyric })
      expect((await songApi.detail(1)).lyricTranslation).toBe(uploadedTranslation)

      await lyricApi.upload(1, new File([uploadedTranslation], 'translated.lrc', { type: 'text/plain' }), 'translation')
      expect((await lyricApi.parse(1)).translationLines[0].text).toBe('Uploaded translation')

      await lyricApi.save({ songId: 1, lyricTranslation: '' })
      expect((await lyricApi.parse(1)).translationLines).toEqual([])
    } finally {
      await lyricApi.save({ songId: 1, lyric: original.lyric, lyricTranslation: original.lyricTranslation })
    }
  })

  it('歌单支持创建、批量加歌、删歌和删除', async () => {
    await loginAs('demo')
    const created = await playlistApi.save({ name: '自动化测试歌单', description: 'Vitest' })
    expect(created).toMatchObject({ name: '自动化测试歌单', creatorId: 2 })

    expect(await playlistApi.addSongs(created.id, [1, 2, 999, 2])).toBe(2)
    expect((await playlistApi.songsOfPlaylist(created.id)).map((song) => song.id)).toEqual([1, 2])
    await playlistApi.removeSong(created.id, 1)
    expect((await playlistApi.songsOfPlaylist(created.id)).map((song) => song.id)).toEqual([2])
    await playlistApi.remove(created.id)
    await expect(playlistApi.detail(created.id)).rejects.toMatchObject({ code: 500 })
  })

  it('全局搜索支持歌曲/原歌词/译文/歌手和公开歌单，并隐藏完整歌词正文', async () => {
    const result = await searchApi.search('霓虹', 12)
    expect(result.keyword).toBe('霓虹')
    expect(result.songs.some((song) => song.id === 1)).toBe(true)
    expect(result.playlists.some((playlist) => playlist.name === '深夜霓虹')).toBe(true)
    expect(result.songs[0]).not.toHaveProperty('lyric')
    expect(result.songs[0]).not.toHaveProperty('lyricTranslation')

    const translationMatch = await searchApi.search('Neon wakes', 12)
    expect(translationMatch.songs.map((song) => song.id)).toContain(1)
    expect(translationMatch.songs[0]).not.toHaveProperty('lyricTranslation')
  })

  it('专辑从现有歌曲聚合，可按歌手筛选并查询曲目', async () => {
    const page = await albumApi.page({ pageNum: 1, pageSize: 12, keyword: '苏晚' })
    expect(page.total).toBe(2)
    expect(page.records.map((album) => album.singerName)).toEqual(['苏晚', '苏晚'])

    const detail = await albumApi.detail('《云端信使》', 2)
    expect(detail).toMatchObject({ album: '《云端信使》', singerId: 2, singerName: '苏晚', songCount: 1 })
    const tracks = await albumApi.songs(detail.album, detail.singerId)
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ id: 2, title: '云端信使' })
    expect(tracks[0]).not.toHaveProperty('lyric')
    await expect(albumApi.detail('不存在的专辑')).rejects.toMatchObject({ code: 404 })
  })

  it('相似歌曲电台优先返回同歌手或同分类曲目并排除起点歌曲', async () => {
    const source = await songApi.detail(1)
    const picks = await recommendationApi.similar(source.id, 2)
    expect(picks).toHaveLength(2)
    expect(picks.some((song) => song.id === source.id)).toBe(false)
    expect(picks.every((song) => song.singerId === source.singerId || song.categoryId === source.categoryId)).toBe(true)
    expect(picks.every((song) => !Object.hasOwn(song, 'lyric'))).toBe(true)
    await expect(recommendationApi.similar(999, 12)).rejects.toMatchObject({ code: 404 })
  })

  it('个性化推荐排除最近已听/已收藏歌曲，并限制结果数量', async () => {
    await loginAs('demo')
    const picks = await recommendationApi.songs(4)
    const ids = picks.map((song) => song.id)
    expect(picks.length).toBeGreaterThan(0)
    expect(picks.length).toBeLessThanOrEqual(4)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toEqual(expect.arrayContaining([1, 4, 6]))
    expect(picks[0]).not.toHaveProperty('lyric')

    const dailyPicks = await recommendationApi.songs(24)
    expect(dailyPicks.length).toBeGreaterThan(0)
    expect(dailyPicks.length).toBeLessThanOrEqual(24)
    expect(new Set(dailyPicks.map((song) => song.id)).size).toBe(dailyPicks.length)
  })

  it('播放会记录登录用户历史；支持按歌曲移除、清空，匿名播放不写入个人历史', async () => {
    await useUserStore().logoutLocal()
    await songApi.play(8)
    await loginAs('demo')
    expect((await historyApi.page()).records.some((song) => song.id === 8)).toBe(false)

    await songApi.play(3)
    await songApi.play(3)
    let page = await historyApi.page()
    expect(page.records[0]).toMatchObject({ id: 3, personalPlayCount: 2 })
    expect(page.records[0].lastPlayedAt).toBeTruthy()

    await historyApi.remove(3)
    expect((await historyApi.page()).records.some((song) => song.id === 3)).toBe(false)
    await historyApi.clear()
    page = await historyApi.page()
    expect(page.total).toBe(0)
  })

  it('私密歌单只有所有者和管理员能读取详情及曲目', async () => {
    await loginAs('demo')
    const created = await playlistApi.save({ name: '仅自己可见', isPublic: 0 })
    await playlistApi.addSongs(created.id, [2])
    await expect(playlistApi.detail(created.id)).resolves.toMatchObject({ id: created.id })

    await useUserStore().logoutLocal()
    await expect(playlistApi.detail(created.id)).rejects.toMatchObject({ code: 404 })
    await expect(playlistApi.songsOfPlaylist(created.id)).rejects.toMatchObject({ code: 404 })
    expect((await playlistApi.page({ onlyMine: true })).records).toEqual([])

    await loginAs('admin')
    await expect(playlistApi.songsOfPlaylist(created.id)).resolves.toHaveLength(1)
    await useUserStore().logoutLocal()
    await loginAs('demo')
    await playlistApi.remove(created.id)
  })

  it('短评支持游客阅读、登录发布、幂等点赞与作者删除', async () => {
    await loginAs('demo')
    const content = `短评权限测试 ${Date.now()}`
    const created = await reviewApi.create({ targetType: 'song', targetId: 7, content })
    expect(created).toMatchObject({ targetType: 'song', targetId: 7, content, status: 1, mine: true, likeCount: 0 })

    const liked = await reviewApi.setLiked(created.id, true)
    expect(liked).toMatchObject({ liked: true, likeCount: 1 })
    await expect(reviewApi.setLiked(created.id, true)).resolves.toMatchObject({ likeCount: 1 })
    await expect(reviewApi.setLiked(created.id, false)).resolves.toMatchObject({ liked: false, likeCount: 0 })

    await useUserStore().logoutLocal()
    const publicPage = await reviewApi.page({ targetType: 'song', targetId: 7 })
    expect(publicPage.records.some((review) => review.id === created.id && review.content === content)).toBe(true)
    await expect(reviewApi.create({ targetType: 'song', targetId: 7, content: '游客不能发言' }))
      .rejects.toMatchObject({ code: 401 })

    await loginAs('admin')
    await expect(reviewApi.remove(created.id)).rejects.toMatchObject({ code: 403 })
    await loginAs('demo')
    await reviewApi.remove(created.id)
    const afterDelete = await reviewApi.page({ targetType: 'song', targetId: 7 })
    expect(afterDelete.records.some((review) => review.id === created.id)).toBe(false)
  })

  it('短评支持 500 字限制、每分钟 3 条限频与分页', async () => {
    await loginAs('demo')
    await expect(reviewApi.create({ targetType: 'song', targetId: 7, content: '超长内容'.repeat(126) }))
      .rejects.toMatchObject({ code: 400 })

    const created = []
    for (let index = 1; index <= 3; index++) {
      created.push(await reviewApi.create({ targetType: 'song', targetId: 7, content: `限频分页 ${index} ${Date.now()}` }))
    }
    await expect(reviewApi.create({ targetType: 'song', targetId: 7, content: '第四条应被限频' }))
      .rejects.toMatchObject({ code: 429 })

    const firstPage = await reviewApi.page({ targetType: 'song', targetId: 7, pageNum: 1, pageSize: 2 })
    expect(firstPage).toMatchObject({ total: 3, current: 1, size: 2, pages: 2 })
    expect(firstPage.records).toHaveLength(2)
    for (const review of created) await reviewApi.remove(review.id)
  })

  it('私密歌单短评不会向无权用户泄露', async () => {
    await loginAs('demo')
    const playlist = await playlistApi.save({ name: `短评权限歌单 ${Date.now()}`, isPublic: 0 })
    const review = await reviewApi.create({ targetType: 'playlist', targetId: playlist.id, content: '只对拥有者可见' })

    await useUserStore().logoutLocal()
    await expect(reviewApi.page({ targetType: 'playlist', targetId: playlist.id })).rejects.toMatchObject({ code: 404 })
    await loginAs('admin')
    await expect(reviewApi.page({ targetType: 'playlist', targetId: playlist.id })).resolves.toMatchObject({
      records: [expect.objectContaining({ id: review.id, content: '只对拥有者可见' })]
    })
    await useUserStore().logoutLocal()
    await loginAs('demo')
    await reviewApi.remove(review.id)
    await playlistApi.remove(playlist.id)
  })

  it('举报进入管理员队列；隐藏会结束待处理举报并只向作者展示说明', async () => {
    await loginAs('demo')
    const created = await reviewApi.create({ targetType: 'playlist', targetId: 1, content: `举报审核测试 ${Date.now()}` })

    await useUserStore().logoutLocal()
    await loginAs('admin')
    await reviewApi.report(created.id, { reason: 'spam', details: '用于验证举报流程' })
    await expect(reviewApi.report(created.id, { reason: 'spam' })).rejects.toMatchObject({ code: 409 })
    const queue = await reviewApi.adminReportsPage({ status: 0 })
    expect(queue.records).toEqual(expect.arrayContaining([expect.objectContaining({ reviewId: created.id, status: 0 })]))

    await reviewApi.handleReport(queue.records.find((item) => item.reviewId === created.id).id, {
      action: 'hide', note: '经审核，短评已隐藏'
    })
    await expect(reviewApi.adminReportsPage({ status: 1 })).resolves.toMatchObject({
      records: expect.arrayContaining([expect.objectContaining({ reviewId: created.id, action: 'hide' })])
    })
    await expect(reviewApi.adminPage({ status: 0 })).resolves.toMatchObject({
      records: expect.arrayContaining([expect.objectContaining({ id: created.id, status: 0 })])
    })

    await loginAs('demo')
    const authorPage = await reviewApi.page({ targetType: 'playlist', targetId: 1 })
    expect(authorPage.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.id, status: 0, moderationNote: '经审核，短评已隐藏' })
    ]))
    await reviewApi.remove(created.id)
  })

  it('管理员直接隐藏短评时也会结案其待处理举报', async () => {
    await loginAs('demo')
    const created = await reviewApi.create({ targetType: 'song', targetId: 7, content: `直接审核测试 ${Date.now()}` })

    await useUserStore().logoutLocal()
    await loginAs('admin')
    await reviewApi.report(created.id, { reason: 'other', details: '审核闭环验证' })
    const openReports = await reviewApi.adminReportsPage({ status: 0 })
    const targetReport = openReports.records.find((item) => item.reviewId === created.id)
    expect(targetReport).toBeDefined()

    await reviewApi.setVisibility(created.id, true, '管理员直接隐藏')
    const afterHideOpen = await reviewApi.adminReportsPage({ status: 0 })
    expect(afterHideOpen.records.some((item) => item.id === targetReport.id)).toBe(false)
    const afterHideResolved = await reviewApi.adminReportsPage({ status: 1 })
    expect(afterHideResolved.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: targetReport.id, action: 'hide', adminNote: '管理员直接隐藏' })
    ]))
    await reviewApi.setVisibility(created.id, false)
    await expect(reviewApi.adminPage({ status: 1 })).resolves.toMatchObject({
      records: expect.arrayContaining([expect.objectContaining({ id: created.id, status: 1 })])
    })

    await loginAs('demo')
    await reviewApi.remove(created.id)
  })

  it('管理员驳回举报后短评保持公开', async () => {
    await loginAs('demo')
    const created = await reviewApi.create({ targetType: 'song', targetId: 7, content: `驳回举报测试 ${Date.now()}` })

    await useUserStore().logoutLocal()
    await loginAs('admin')
    await reviewApi.report(created.id, { reason: 'other' })
    const openReports = await reviewApi.adminReportsPage({ status: 0 })
    const targetReport = openReports.records.find((item) => item.reviewId === created.id)
    expect(targetReport).toBeDefined()

    await reviewApi.handleReport(targetReport.id, { action: 'dismiss', note: '经审核，未发现违规' })
    const dismissed = await reviewApi.adminReportsPage({ status: 2 })
    expect(dismissed.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: targetReport.id, status: 2, action: 'dismiss' })
    ]))
    await expect(reviewApi.adminPage({ status: 1 })).resolves.toMatchObject({
      records: expect.arrayContaining([expect.objectContaining({ id: created.id, status: 1 })])
    })

    await loginAs('demo')
    await reviewApi.remove(created.id)
  })

  it('设置页资料接口可更新和恢复，主题状态可区分账号同步与本机保存', async () => {
    await loginAs('demo')
    const original = await userApi.getProfile()
    const updated = await userApi.updateProfile({
      nickname: '全息设置测试',
      avatar: original.avatar,
      email: original.email,
      phone: original.phone,
      gender: original.gender
    })
    expect(updated).toMatchObject({ username: 'demo', nickname: '全息设置测试' })
    await userApi.updateProfile({
      nickname: original.nickname,
      avatar: original.avatar,
      email: original.email,
      phone: original.phone,
      gender: original.gender
    })

    const themeStore = useThemeStore()
    await expect(themeStore.setTheme('ruby')).resolves.toEqual({ synced: true, localOnly: false })
    await themeStore.setTheme('magenta')
    await useUserStore().logoutLocal()
    await expect(themeStore.setTheme('amber')).resolves.toEqual({ synced: false, localOnly: true })
  })

  it('绯红 3D 主题可从接口获取并同步至用户设置', async () => {
    await loginAs('demo')
    const settings = await systemApi.getTheme()
    expect(settings.themes).toContain('ruby')
    await expect(systemApi.setTheme({ theme: 'ruby', scope: 'user' })).resolves.toMatchObject({ theme: 'ruby' })
    expect(THEMES.find((theme) => theme.key === 'ruby')).toMatchObject({ label: '绯红现场', mood: 'LIVE ROOM' })
    await systemApi.setTheme({ theme: 'cyan', scope: 'user' })
  })

  it('全站玻璃不透明度有安全范围并实时写入 CSS 变量', () => {
    const themeStore = useThemeStore()
    themeStore.apply('ruby')
    themeStore.setGlassOpacity(52)
    expect(themeStore.glassOpacity).toBe(52)
    expect(document.documentElement.style.getPropertyValue('--glass-alpha')).toBe('0.52')
    expect(document.documentElement.style.getPropertyValue('--bg-panel')).toContain('0.52')
    expect(localStorage.getItem('mh_glass_opacity')).toBe('52')

    themeStore.setGlassOpacity(100)
    expect(themeStore.glassOpacity).toBe(88)
    themeStore.apply('cyan')
    themeStore.setGlassOpacity(68)
  })
})

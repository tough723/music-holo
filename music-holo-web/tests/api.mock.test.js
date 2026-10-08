import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/user'
import { usePlayerStore } from '@/store/player'
import * as authApi from '@/api/auth'
import * as commonApi from '@/api/common'
import * as favoriteApi from '@/api/favorite'
import * as lyricApi from '@/api/lyric'
import * as playlistApi from '@/api/playlist'
import * as queueApi from '@/api/queue'
import * as searchApi from '@/api/search'
import * as recommendationApi from '@/api/recommend'
import * as historyApi from '@/api/history'
import * as songApi from '@/api/song'
import * as systemApi from '@/api/system'
import { useThemeStore, THEMES } from '@/store/theme'

// API 错误仍由 Mock 层抛出；只屏蔽 UI 通知，避免测试输出污染。
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

async function loginAs(username = 'demo') {
  return useUserStore().login({ username, password: '123456' })
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  usePlayerStore().cancelSleepTimer()
  vi.useRealTimers()
  vi.restoreAllMocks()
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

  it('歌词解析按时间排序并返回可用于播放器的行结构', async () => {
    const result = await lyricApi.parse(1)
    expect(result).toMatchObject({ songId: 1, title: '霓虹海' })
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.lines[0]).toMatchObject({ time: 0.5, text: '霓虹亮起 城市开始呼吸' })
    expect(result.lines.every((line) => typeof line.time === 'number' && typeof line.text === 'string')).toBe(true)
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

  it('全局搜索支持歌曲/歌词/歌手和公开歌单，并隐藏完整歌词正文', async () => {
    const result = await searchApi.search('霓虹', 12)
    expect(result.keyword).toBe('霓虹')
    expect(result.songs.some((song) => song.id === 1)).toBe(true)
    expect(result.playlists.some((playlist) => playlist.name === '深夜霓虹')).toBe(true)
    expect(result.songs[0]).not.toHaveProperty('lyric')
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

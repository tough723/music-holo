import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/user'
import * as authApi from '@/api/auth'
import * as commonApi from '@/api/common'
import * as favoriteApi from '@/api/favorite'
import * as lyricApi from '@/api/lyric'
import * as playlistApi from '@/api/playlist'
import * as queueApi from '@/api/queue'

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
})

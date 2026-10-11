/**
 * P2 服务端集成（Mock 通道 + store 行为）：
 * - /session 会话快照 PUT/GET/DELETE 往返与校验（P2-7）
 * - /stat/batch 幂等批量上报与 /stat/summary 汇总（P2-8）
 * - /lyric/offset 众包共识（P2-9）
 * - stats store 的 eventId / markReported / reportPending 脱敏上报
 * - player store 的 pushSessionSnapshot / pullRemoteSession 本地优先同步
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/user'
import { usePlayerStore } from '@/store/player'
import { useStatsStore } from '@/store/stats'
import * as sessionApi from '@/api/session'
import * as statsApi from '@/api/stats'
import * as lyricApi from '@/api/lyric'
import * as authApi from '@/api/auth'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

async function loginAs(username) {
  return useUserStore().login({ username, password: '123456' })
}

async function registerUser(username) {
  await authApi.register({ username, password: '123456', nickname: username })
  return loginAs(username)
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('会话快照 /session（P2-7）', () => {
  it('PUT -> GET 完整往返，队列/进度/模式/倍速原样恢复', async () => {
    await loginAs('demo')
    const saved = await sessionApi.saveSession({
      queueIds: [1, 2, 3], currentSongId: 2, position: 12.5, mode: 'loop', playbackRate: 1.5
    })
    expect(saved.version).toBe(1)
    expect(saved.expiresAt - saved.savedAt).toBe(7 * 24 * 60 * 60 * 1000)

    const restored = await sessionApi.fetchSession()
    expect(restored.queueIds).toEqual([1, 2, 3])
    expect(restored.currentSongId).toBe(2)
    expect(restored.position).toBe(12.5)
    expect(restored.mode).toBe('loop')
    expect(restored.playbackRate).toBe(1.5)
  })

  it('校验：空队列 / 非法模式 / 非法倍速 / 当前曲目不在队列 / 未知歌曲', async () => {
    await loginAs('demo')
    await expect(sessionApi.saveSession({ queueIds: [] })).rejects.toThrow('队列不能为空')
    await expect(sessionApi.saveSession({ queueIds: [1], mode: 'nope' })).rejects.toThrow('播放模式不支持')
    await expect(sessionApi.saveSession({ queueIds: [1], playbackRate: 3 })).rejects.toThrow('播放倍速不支持')
    await expect(sessionApi.saveSession({ queueIds: [1], currentSongId: 2 })).rejects.toThrow('当前曲目不在队列中')
    await expect(sessionApi.saveSession({ queueIds: [99999], currentSongId: 99999 })).rejects.toThrow(/^歌曲不存在/)
  })

  it('DELETE 之后 GET 返回 null', async () => {
    await loginAs('demo')
    await sessionApi.saveSession({ queueIds: [1], mode: 'order', playbackRate: 1 })
    await sessionApi.clearSession()
    expect(await sessionApi.fetchSession()).toBe(null)
  })

  it('不同账号的快照相互隔离', async () => {
    await loginAs('demo')
    await sessionApi.saveSession({ queueIds: [1], mode: 'order', playbackRate: 1 })
    await loginAs('admin')
    expect(await sessionApi.fetchSession()).toBe(null)
  })
})

describe('收听统计 /stat（P2-8）', () => {
  it('批量上报 accepted/duplicates，重放幂等', async () => {
    await loginAs('demo')
    const now = Date.now()
    const events = [
      { eventId: 'e1', type: 'play', songId: 1, at: now },
      { eventId: 'e2', type: 'complete', songId: 1, duration: 240, position: 240, at: now }
    ]
    const first = await statsApi.reportStatEvents(events)
    expect(first).toEqual({ accepted: 2, duplicates: 0 })
    const second = await statsApi.reportStatEvents(events)
    expect(second).toEqual({ accepted: 0, duplicates: 2 })
  })

  it('超过 200 条整批拒绝；无效事件拒绝', async () => {
    await loginAs('demo')
    const now = Date.now()
    const tooMany = Array.from({ length: 201 }, (_, i) => ({ eventId: `x${i}`, type: 'play', songId: 1, at: now }))
    await expect(statsApi.reportStatEvents(tooMany)).rejects.toThrow('批量上报最多 200 条')
    await expect(statsApi.reportStatEvents([{ eventId: '', type: 'play', at: now }])).rejects.toThrow('事件 id 不能为空')
    await expect(statsApi.reportStatEvents([{ eventId: 'ok', type: 'nope', at: now }])).rejects.toThrow('事件类型不支持')
  })

  it('summary 聚合播放/播完/秒数并按曲目取 top', async () => {
    // 独立账号：Mock 的 stat 存储是模块级的，避免与上面用例串数据
    await registerUser('summarieser')
    const now = Date.now()
    await statsApi.reportStatEvents([
      { eventId: 's1', type: 'play', songId: 1, at: now },
      { eventId: 's2', type: 'complete', songId: 1, duration: 240, position: 240, at: now },
      { eventId: 's3', type: 'skip', songId: 2, duration: 200, position: 30, at: now }
    ])
    const summary = await statsApi.fetchStatSummary(7)
    expect(summary.plays).toBe(1)
    expect(summary.completes).toBe(1)
    expect(summary.skips).toBe(1)
    expect(summary.seconds).toBe(270)
    expect(summary.topSongs[0]).toMatchObject({ songId: 1, seconds: 240 })
    expect(typeof summary.topSongs[0].title).toBe('string')
  })
})

describe('歌词时间轴共识 /lyric/offset（P2-9）', () => {
  it('少于 3 个账号不下发共识；第 3 个账号后下发中位数；撤回回退', async () => {
    await loginAs('demo')
    const empty = await lyricApi.fetchLyricOffset(1)
    expect(empty).toMatchObject({ songId: 1, offsetMs: null, count: 0, minReports: 3, mine: null })

    const first = await lyricApi.submitLyricOffset(1, 800)
    expect(first).toMatchObject({ mine: 800, count: 1, offsetMs: null })

    await loginAs('admin')
    const second = await lyricApi.submitLyricOffset(1, 900)
    expect(second).toMatchObject({ count: 2, offsetMs: null })

    await registerUser('medianuser')
    const third = await lyricApi.submitLyricOffset(1, 850)
    expect(third).toMatchObject({ count: 3, offsetMs: 850 })

    // demo 撤回后共识条件不再满足
    await loginAs('demo')
    const withdrawn = await lyricApi.withdrawLyricOffset(1)
    expect(withdrawn).toMatchObject({ count: 2, offsetMs: null, mine: null })
  })

  it('±5000 之外的偏移被拒绝', async () => {
    await loginAs('demo')
    await expect(lyricApi.submitLyricOffset(1, 6000)).rejects.toThrow('偏移需在 ±5000 毫秒以内')
  })
})

describe('stats store 服务端上报', () => {
  it('record 自动生成 eventId；markReported 跨 store 重建保持幂等', () => {
    const store = useStatsStore()
    const entry = store.record({ type: 'play', songId: 1, title: '海阔天空', at: Date.now() })
    expect(entry.eventId).toBeTruthy()
    store.flush()
    expect(store.pendingEvents).toHaveLength(1)

    store.markReported([entry.eventId])
    expect(store.pendingEvents).toHaveLength(0)

    // 重建 store（模拟刷新）：reportedEventIds 从 localStorage 恢复
    setActivePinia(createPinia())
    const reloaded = useStatsStore()
    expect(reloaded.events).toHaveLength(1)
    expect(reloaded.pendingEvents).toHaveLength(0)
  })

  it('reportPending 只上报脱敏字段并按 200 条分批；离线未登录跳过', async () => {
    const store = useStatsStore()
    for (let i = 0; i < 250; i++) {
      store.record({ type: 'play', songId: 1, title: `曲${i}`, artist: '艺人', source: 'netease', at: Date.now() })
    }
    store.flush()
    expect(store.pendingEvents).toHaveLength(250)

    const calls = []
    const fakeApi = vi.fn(async (payload) => {
      calls.push(payload)
      return { accepted: payload.length, duplicates: 0 }
    })
    // 未登录：跳过，不发请求
    const skipped = await store.reportPending({ apiCall: fakeApi })
    expect(skipped).toEqual({ reported: 0, batches: 0, skipped: 'offline' })
    expect(fakeApi).not.toHaveBeenCalled()

    localStorage.setItem('mh_token', 'fake-token')
    const result = await store.reportPending({ apiCall: fakeApi })
    expect(result).toEqual({ reported: 250, batches: 2 })
    expect(calls.map((c) => c.length)).toEqual([200, 50])
    // 隐私：请求体不含标题/艺人/来源
    for (const payload of calls) {
      for (const item of payload) {
        expect(Object.keys(item).sort()).toEqual(['at', 'duration', 'eventId', 'position', 'songId', 'type'])
        expect(item).not.toHaveProperty('title')
        expect(item).not.toHaveProperty('artist')
        expect(item).not.toHaveProperty('source')
      }
    }
    expect(store.pendingEvents).toHaveLength(0)
  })

  it('reportPending 单批失败即停，已上报部分保持已标记（幂等重试）', async () => {
    localStorage.setItem('mh_token', 'fake-token')
    const store = useStatsStore()
    for (let i = 0; i < 5; i++) store.record({ type: 'play', songId: 1, at: Date.now() })
    store.flush()
    const ids = store.events.map((e) => e.eventId)

    const failing = vi.fn(async (payload) => {
      if (payload[0].eventId === ids[0]) return { accepted: payload.length, duplicates: 0 }
      throw new Error('网络中断')
    })
    // maxBatches 限 1 让第一批成功、后续不再发；再放开测失败中断
    const ok = await store.reportPending({ apiCall: failing, maxBatches: 1 })
    expect(ok.reported).toBeGreaterThan(0)
    const remainingBefore = store.pendingEvents.length
    const partial = await store.reportPending({ apiCall: failing })
    expect(partial.batches).toBeLessThanOrEqual(1)
    expect(store.pendingEvents.length).toBeLessThanOrEqual(remainingBefore)
  })
})

describe('player store 服务端会话同步（本地优先）', () => {
  function withQueue(store) {
    store.$patch({
      queue: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }],
      currentIndex: 1,
      currentTime: 30,
      mode: 'loop',
      playbackRate: 1.25
    })
  }

  it('pushSessionSnapshot 先落本地再推服务端；服务端失败不影响本地快照', async () => {
    localStorage.setItem('mh_token', 'fake-token')
    const store = usePlayerStore()
    withQueue(store)

    const ok = vi.spyOn(sessionApi, 'saveSession').mockResolvedValue({ version: 1, savedAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 3600 * 1000 })
    const snapshot = store.pushSessionSnapshot()
    expect(snapshot).toMatchObject({ queueIds: [1, 2], currentSongId: 2, position: 30, mode: 'loop', playbackRate: 1.25 })
    expect(ok).toHaveBeenCalledTimes(1)
    await Promise.resolve()

    ok.mockRejectedValue(new Error('离线'))
    const snapshot2 = store.pushSessionSnapshot({ now: Date.now() + 1000 })
    expect(snapshot2).toBeTruthy()
    expect(store.sessionSnapshot).toMatchObject({ queueIds: [1, 2] })
    await Promise.resolve()
  })

  it('未登录时 pushSessionSnapshot 不发请求', () => {
    const store = usePlayerStore()
    withQueue(store)
    const spy = vi.spyOn(sessionApi, 'saveSession')
    expect(store.pushSessionSnapshot()).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
  })

  it('pullRemoteSession：服务端更新时覆盖本地；网络失败保留本地快照', async () => {
    const store = usePlayerStore()
    const stale = { version: 1, queueIds: [1], currentSongId: 1, position: 1, mode: 'order', playbackRate: 1, savedAt: Date.now() - 60_000 }
    store.$patch({ sessionSnapshot: stale })

    const newer = { version: 1, queueIds: [2, 1], currentSongId: 1, position: 42, mode: 'random', playbackRate: 1, savedAt: Date.now() }
    vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(newer)
    const pulled = await store.pullRemoteSession()
    expect(pulled).toMatchObject({ queueIds: [2, 1], position: 42, mode: 'random' })
    expect(store.sessionSnapshot).toMatchObject({ queueIds: [2, 1] })

    // 服务端比本地旧：保留本地
    store.$patch({ sessionSnapshot: { ...newer, savedAt: Date.now() + 1000 } })
    vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(newer)
    expect(await store.pullRemoteSession()).toBe(null)

    // 网络失败：保留本地
    const local = store.sessionSnapshot
    vi.spyOn(sessionApi, 'fetchSession').mockRejectedValue(new Error('离线'))
    expect(await store.pullRemoteSession()).toBe(null)
    expect(store.sessionSnapshot).toBe(local)
  })
})

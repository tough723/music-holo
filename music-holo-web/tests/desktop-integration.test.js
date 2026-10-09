import { describe, expect, it, vi } from 'vitest'
import {
  bindDesktopIntegration,
  collectDesktopState,
  deepLinkToRoute,
  runApiCommand,
  runDesktopCommand
} from '@/utils/desktopIntegration'

function createPlayerStore() {
  return {
    playing: false,
    volume: 0.5,
    mode: 'loop',
    currentTime: 12,
    duration: 240,
    queue: [
      { id: 'a', title: '海阔天空', singerName: 'Beyond' },
      { id: 'b', title: '今天', singerName: '刘德华' }
    ],
    currentIndex: 0,
    lyrics: [{ time: 1, text: '今天我' }],
    lyricTranslations: [{ time: 1, text: 'today I' }],
    lyricRomaji: [],
    get currentSong() { return this.queue[this.currentIndex] },
    next() { this.played = 'next' },
    prev() { this.played = 'prev' },
    setVolume(value) { this.volume = value },
    lyricView: { showTranslation: false, showRomaji: true, showVerbatim: true, immersive: false, fontSize: 'large', offsetMs: 800 },
    adjustLyricOffset(delta) { this.lastOffsetDelta = delta }
  }
}

function createBridge() {
  const commands = []
  const apiCalls = []
  const deepLinks = []
  const states = []
  const listeners = { command: [], api: [], deepLink: [] }
  return {
    commands, apiCalls, deepLinks, states,
    respond: vi.fn(),
    pushLyricState: vi.fn((state) => { states.push(state); return Promise.resolve() }),
    onCommand: (listener) => { listeners.command.push(listener); return () => {} },
    onApi: (listener) => { listeners.api.push(listener); return () => {} },
    onDeepLink: (listener) => { listeners.deepLink.push(listener); return () => {} },
    respondApi: vi.fn(),
    emitCommand: (command) => listeners.command.forEach((listener) => listener({ command })),
    emitApi: (message) => listeners.api.forEach((listener) => listener(message)),
    emitDeepLink: (link) => listeners.deepLink.forEach((listener) => listener(link))
  }
}

describe('桌面系统集成', () => {
  it('托盘/快捷键命令只驱动播放器状态', () => {
    const store = createPlayerStore()
    expect(runDesktopCommand(store, 'toggle')).toBe(true)
    expect(store.playing).toBe(true)
    runDesktopCommand(store, 'pause')
    expect(store.playing).toBe(false)
    runDesktopCommand(store, 'next')
    expect(store.played).toBe('next')
    runDesktopCommand(store, 'volumeUp')
    expect(store.volume).toBeCloseTo(0.55)
    runDesktopCommand(store, 'volumeDown')
    expect(store.volume).toBeCloseTo(0.5)
    expect(runDesktopCommand(store, 'not-a-command')).toBe(false)
  })

  it('桌面歌词窗的校准请求转发给播放器 store（歌词窗自己不保存偏好）', () => {
    const store = createPlayerStore()
    expect(runDesktopCommand(store, 'lyricOffset', { deltaMs: 500 })).toBe(true)
    expect(store.lastOffsetDelta).toBe(500)
    // 非法输入按 0 处理，不会把 NaN 写进偏好。
    runDesktopCommand(store, 'lyricOffset', { deltaMs: 'x' })
    expect(store.lastOffsetDelta).toBe(0)
  })

  it('推送给歌词窗的字段只有展示所需内容', () => {
    const state = collectDesktopState(createPlayerStore())
    expect(state).toEqual({
      title: '海阔天空',
      singer: 'Beyond',
      album: '',
      cover: '',
      playing: false,
      currentTime: 12,
      duration: 240,
      lyrics: [{ time: 1, text: '今天我' }],
      translations: [{ time: 1, text: 'today I' }],
      // 桌面歌词窗与站内歌词台共用一套显示偏好（译文/字号/时间校准），只传展示所需字段。
      lyricView: { showTranslation: false, showRomaji: true, showVerbatim: true, immersive: false, fontSize: 'large', offsetMs: 800 }
    })
    expect(JSON.stringify(state)).not.toContain('audioUrl')
  })

  it('过桥数据先转成可结构化克隆的纯数据（响应式 Proxy 会被 contextBridge 拒绝）', async () => {
    const store = createPlayerStore()
    // 模拟 Vue 响应式：state 里的数组是 Proxy，Chromium 结构化克隆会直接抛
    // DataCloneError: An object could not be cloned，进而让主进程/渲染进程桥调用失败。
    store.lyrics = new Proxy([{ time: 1, text: '今天我' }], {})
    store.lyricTranslations = new Proxy([{ time: 1, text: 'today I' }], {})
    store.lyricRomaji = new Proxy([], {})

    const state = collectDesktopState(store)
    expect(state.lyrics).toEqual([{ time: 1, text: '今天我' }])
    expect(() => structuredClone(state)).not.toThrow()

    const lyrics = await runApiCommand('lyrics', {}, { playerStore: store })
    expect(() => structuredClone(lyrics)).not.toThrow()
  })

  it('启动参数只翻译成站内路由，非法路径被丢弃', () => {
    expect(deepLinkToRoute({ action: 'search', params: { q: '海阔天空' } })).toEqual({ path: '/search', query: { q: '海阔天空' } })
    expect(deepLinkToRoute({ action: 'import', params: { url: 'https://music.163.com/#/playlist?id=1' } })).toEqual({ path: '/import', query: { link: 'https://music.163.com/#/playlist?id=1' } })
    expect(deepLinkToRoute({ action: 'lyrics', params: {} })).toEqual({ path: '/lyrics' })
    expect(deepLinkToRoute({ action: 'open', params: { path: '/queue' } })).toEqual({ path: '/queue' })
    expect(deepLinkToRoute({ action: 'open', params: { path: 'http://evil.example' } })).toBeNull()
    expect(deepLinkToRoute({ action: 'play', params: { id: '42' } })).toEqual({ path: '/songs', query: { play: '42' } })
    expect(deepLinkToRoute({ action: 'exec', params: { cmd: 'rm' } })).toBeNull()
    expect(deepLinkToRoute(null)).toBeNull()
  })

  it('绑定后转发命令、推送歌词状态、回传 API 结果并响应启动参数', async () => {
    vi.useFakeTimers()
    try {
      const playerStore = createPlayerStore()
      const bridge = createBridge()
      const pushed = []
      const router = { push: vi.fn((target) => { pushed.push(target); return Promise.resolve() }) }
      const unbind = bindDesktopIntegration({ playerStore, router, integration: bridge })

      bridge.emitCommand('toggle')
      expect(playerStore.playing).toBe(true)

      vi.advanceTimersByTime(600)
      expect(bridge.pushLyricState).toHaveBeenCalled()
      // 状态未变化时不会重复推送，避免高频 IPC。
      const callsAfterFirst = bridge.pushLyricState.mock.calls.length
      vi.advanceTimersByTime(1000)
      expect(bridge.pushLyricState.mock.calls.length).toBe(callsAfterFirst)

      await bridge.emitApi({ id: 'req-1', command: 'status', payload: {} })
      expect(bridge.respondApi).toHaveBeenCalled()
      expect(bridge.respondApi.mock.calls.at(-1)[0].result).toMatchObject({ playing: true, queueLength: 2 })

      await bridge.emitApi({ id: 'req-2', command: 'nope', payload: {} })
      expect(bridge.respondApi.mock.calls.at(-1)[0].error).toMatch('未知命令')

      bridge.emitDeepLink({ action: 'lyrics', params: {} })
      expect(pushed).toContainEqual({ path: '/lyrics' })

      unbind()
      vi.advanceTimersByTime(1000)
      expect(bridge.pushLyricState.mock.calls.length).toBe(callsAfterFirst)
    } finally {
      vi.useRealTimers()
    }
  })

  it('本机 API 命令：状态/队列只读，写命令校验参数', async () => {
    const store = createPlayerStore()
    const searchApi = vi.fn().mockResolvedValue({ songs: [] })
    const status = await runApiCommand('status', {}, { playerStore: store })
    expect(status).toMatchObject({ playing: false, volume: 0.5, mode: 'loop', queueLength: 2 })
    expect(status.song).toMatchObject({ id: 'a', title: '海阔天空' })

    const queue = await runApiCommand('queue', {}, { playerStore: store })
    expect(queue[0]).toMatchObject({ index: 0, current: true, title: '海阔天空' })

    expect(await runApiCommand('volume', { value: 0.2 }, { playerStore: store })).toEqual({ volume: 0.2 })
    expect(await runApiCommand('volume', { value: 5 }, { playerStore: store })).toEqual({ volume: 1 })
    await expect(runApiCommand('volume', {}, { playerStore: store })).rejects.toThrow('0–1')

    expect((await runApiCommand('seek', { seconds: 30 }, { playerStore: store })).currentTime).toBe(30)
    await expect(runApiCommand('seek', { seconds: -1 }, { playerStore: store })).rejects.toThrow('非负')

    expect((await runApiCommand('lyrics', {}, { playerStore: store })).lines).toHaveLength(1)
    await runApiCommand('search', { keyword: '海阔天空' }, { playerStore: store, searchApi })
    expect(searchApi).toHaveBeenCalledWith('海阔天空', 8)
    await expect(runApiCommand('search', {}, { playerStore: store, searchApi })).rejects.toThrow('keyword')

    const router = { push: vi.fn(() => Promise.resolve()) }
    await expect(runApiCommand('navigate', { path: '/queue' }, { playerStore: store, router })).resolves.toEqual({ path: '/queue' })
    await expect(runApiCommand('navigate', { path: 'http://evil' }, { playerStore: store, router })).rejects.toThrow('合法')
    await expect(runApiCommand('unknown', {}, { playerStore: store })).rejects.toThrow('未知命令')
  })
})

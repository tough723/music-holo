import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import PlayerBar from '../src/components/PlayerBar.vue'
import { usePlayerStore, setSessionSongResolver } from '../src/store/player.js'
import { useStatsStore } from '../src/store/stats.js'
import { useLoudnessStore } from '../src/store/loudness.js'
import { useUserStore } from '../src/store/user.js'

const { playlistCalls } = vi.hoisted(() => ({ playlistCalls: { save: [], addSongs: [], page: [], added: null } }))
vi.mock('@/api/playlist', () => ({
  save: async (data) => { playlistCalls.save.push(data); return { id: 99, name: data.name } },
  page: async (params) => {
    playlistCalls.page.push(params)
    return { records: [{ id: 7, name: '深夜电台' }, { id: 8, name: '通勤清单' }], total: 2 }
  },
  addSongs: async (id, ids) => {
    playlistCalls.addSongs.push([id, ids])
    return typeof playlistCalls.added === 'number' ? playlistCalls.added : ids.length
  }
}))

/**
 * 底部播放器是全局组件，这里用真实组件挂载（jsdom）验证它的交互而不是 store 本身：
 * 静音、倍速、进度条 aria、队列搜索/打乱/去重。
 */
let app = null
let host = null

const song = (id, title, duration = 240) => ({
  id,
  title,
  singerName: '演示歌手',
  album: '演示专辑',
  cover: '',
  duration,
  audioUrl: `/audio/${id}.wav`
})

async function mountPlayer() {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(PlayerBar)
  app.use(pinia).use(router).use(ElementPlus)
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) app.component(name, component)
  app.mount(host)
  await router.isReady()
  await nextTick()
  return usePlayerStore(pinia)
}

const flush = async () => { await nextTick(); await nextTick() }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 冷启动模拟：抹掉持久化的曲目对象，只留下会话快照（曲目得靠解析器重新取）。 */
function dropPersistedQueue() {
  const raw = localStorage.getItem('mh_player')
  if (!raw) return
  const state = JSON.parse(raw)
  delete state.queue
  delete state.currentIndex
  delete state.currentTime
  localStorage.setItem('mh_player', JSON.stringify(state))
}

describe('底部播放器交互', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom 不实现媒体播放，桩掉这三个方法避免“Not implemented”噪声；顺带统计调用次数。
    HTMLMediaElement.prototype.play = function () {
      this.__playCalls = (this.__playCalls || 0) + 1
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      this.__pauseCalls = (this.__pauseCalls || 0) + 1
    }
    HTMLMediaElement.prototype.load = function () {
      this.__loadCalls = (this.__loadCalls || 0) + 1
    }
    // jsdom 没有 Web Audio，空间音效应当优雅回退到原声而不是崩掉。
    delete window.AudioContext
    delete window.webkitAudioContext
  })
  afterEach(() => {
    app?.unmount()
    app = null
    host?.remove()
    host = null
    document.body.innerHTML = ''
  })

  it('渲染进度条、倍速与静音入口，进度变化同步到 aria', async () => {
    const store = await mountPlayer()
    const track = host.querySelector('.progress-track')
    expect(track).toBeTruthy()
    expect(track.getAttribute('aria-label')).toBe('播放进度')
    expect(host.querySelector('.pb-rate').textContent.trim()).toBe('1×')
    expect(host.querySelector('.pb-mute').getAttribute('aria-label')).toBe('静音')

    store.playAll([song(1, '霓虹海')], 1)
    store.duration = 240
    store.currentTime = 60
    await flush()
    expect(track.getAttribute('aria-valuenow')).toBe('60')
    expect(track.getAttribute('aria-valuetext')).toBe('01:00 / 04:00')
    expect(track.querySelector('.progress-inner').style.width).toBe('25%')
  })

  it('静音按钮切换静音状态并在取消后恢复原音量', async () => {
    const store = await mountPlayer()
    store.setVolume(0.5)
    const muteButton = () => host.querySelector('.pb-mute')
    muteButton().click()
    await flush()
    expect(store.muted).toBe(true)
    expect(muteButton().getAttribute('aria-label')).toBe('取消静音')
    expect(muteButton().getAttribute('aria-pressed')).toBe('true')

    muteButton().click()
    await flush()
    expect(store.muted).toBe(false)
    expect(store.volume).toBeCloseTo(0.5)
  })

  it('倍速按钮在受支持档位间循环', async () => {
    const store = await mountPlayer()
    const rateButton = () => host.querySelector('.pb-rate')
    rateButton().click()
    await flush()
    expect(store.playbackRate).toBe(1.25)
    expect(rateButton().textContent.trim()).toBe('1.25×')
    rateButton().click()
    await flush()
    expect(store.playbackRate).toBe(1.5)
  })

  it('队列抽屉可按关键词过滤，并提供打乱与去重', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋')], 1)
    store.queue.push(song(2, '云端信使')) // 直接制造一条重复项：addToQueue/playNext 本身会去重
    await flush()

    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    const items = () => Array.from(document.querySelectorAll('.queue-item .queue-title')).map((node) => node.textContent.trim())
    expect(items().length).toBe(4)

    const search = document.querySelector('.queue-search input')
    expect(search).toBeTruthy()
    search.value = '云端'
    search.dispatchEvent(new Event('input'))
    await flush()
    expect(items()).toEqual(['云端信使', '云端信使'])

    search.value = ''
    search.dispatchEvent(new Event('input'))
    await flush()
    expect(items().length).toBe(4)

    document.querySelector('button[aria-label="移除队列中的重复歌曲"]').click()
    await flush()
    expect(items()).toEqual(['霓虹海', '云端信使', '全息之恋'])
    expect(store.queue).toHaveLength(3)
  })

  it('播放失败后可手动跳到下一首，单曲循环也一样', async () => {
    const store = await mountPlayer()
    // 自定义源：跳过“改用本机离线副本”的异步分支，错误路径是同步的
    store.playAll([
      { ...song(1, '霓虹海', 240), isCustomSource: true },
      song(2, '云端信使', 240),
      song(3, '全息之恋', 240)
    ], 1)
    store.setMode('single') // 单曲循环下 next() 不会前进，得靠兜底下标
    await flush()
    const [nativeAudio] = document.querySelectorAll('audio')
    Object.defineProperty(nativeAudio, 'error', { value: { code: 4 }, configurable: true })
    nativeAudio.dispatchEvent(new Event('error'))
    await flush()

    expect(document.querySelector('.pb-retry')).not.toBeNull()
    const skip = document.querySelector('.pb-skip-failed')
    expect(skip).not.toBeNull()
    skip.click()
    await flush()
    expect(store.currentSong.title).toBe('云端信使')
    expect(document.querySelector('.pb-skip-failed')).toBeNull()
    expect(document.querySelector('.pb-retry')).toBeNull()
  })

  it('队列只有一首时不提供跳转入口', async () => {
    const store = await mountPlayer()
    store.playAll([{ ...song(1, '霓虹海', 240), isCustomSource: true }], 1)
    await flush()
    const [nativeAudio] = document.querySelectorAll('audio')
    Object.defineProperty(nativeAudio, 'error', { value: { code: 4 }, configurable: true })
    nativeAudio.dispatchEvent(new Event('error'))
    await flush()
    expect(document.querySelector('.pb-retry')).not.toBeNull()
    expect(document.querySelector('.pb-skip-failed')).toBeNull()
  })

  it('开启自动跳过后会自己跳到下一首，连着坏太多则停手', async () => {
    const store = await mountPlayer()
    const songs = [1, 2, 3, 4, 5, 6].map((id) => ({ ...song(id, `曲目${id}`, 240), isCustomSource: true }))
    store.playAll(songs, 1)
    await flush()

    // 开关在队列面板里
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    const toggle = document.querySelector('.queue-auto-skip input')
    expect(toggle).toBeTruthy()
    expect(toggle.checked).toBe(false)
    toggle.click()
    await flush()
    expect(store.autoSkipOnError).toBe(true)

    const failCurrent = async () => {
      const [nativeAudio] = document.querySelectorAll('audio')
      Object.defineProperty(nativeAudio, 'error', { value: { code: 4 }, configurable: true })
      nativeAudio.dispatchEvent(new Event('error'))
      await flush()
    }

    // 前三首坏掉：自动跳到下一首，界面不留在错误态
    for (let i = 0; i < 3; i += 1) {
      const before = store.currentSong.title
      await failCurrent()
      expect(document.querySelector('.pb-retry')).toBeNull()
      expect(store.currentSong.title).not.toBe(before)
    }
    expect(store.currentSong.title).toBe('曲目4')

    // 连着失败太多次：不再自动跳，把错误交回给用户（避免整列坏歌时空转）
    await failCurrent()
    expect(document.querySelector('.pb-retry')).not.toBeNull()
    expect(store.currentSong.title).toBe('曲目4')
  })

  it('单曲循环下不开自动跳过（不能替用户放弃重复播放）', async () => {
    const store = await mountPlayer()
    store.playAll([
      { ...song(1, '霓虹海', 240), isCustomSource: true },
      song(2, '云端信使', 240)
    ], 1)
    store.setMode('single')
    store.setAutoSkipOnError(true)
    await flush()
    const [nativeAudio] = document.querySelectorAll('audio')
    Object.defineProperty(nativeAudio, 'error', { value: { code: 4 }, configurable: true })
    nativeAudio.dispatchEvent(new Event('error'))
    await flush()
    expect(store.currentSong.title).toBe('霓虹海') // 停在原地
    expect(document.querySelector('.pb-retry')).not.toBeNull()
    expect(document.querySelector('.pb-skip-failed')).not.toBeNull() // 手动仍可跳
  })

  it('缓冲卡死且开着自动跳过时，会自己挪到下一首', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      store.playAll([song(1, '霓虹海', 240), song(2, '云端信使', 240), song(3, '全息之恋', 240)], 1)
      store.setAutoSkipOnError(true)
      await flush()
      const [nativeAudio] = document.querySelectorAll('audio')
      Object.defineProperty(nativeAudio, 'paused', { value: false, configurable: true })
      Object.defineProperty(nativeAudio, 'readyState', { value: 2, configurable: true })
      store.playing = true
      await flush()

      // 每首都会卡 8 秒 × 3 次重试后判定失败，然后自动跳过；连着坏太多就停手。
      for (let i = 0; i < 16; i += 1) {
        vi.advanceTimersByTime(12000)
        await flush()
      }
      expect(store.currentSong.title).not.toBe('霓虹海')
      expect(document.querySelector('.pb-retry')).not.toBeNull() // 用尽机会后回到手动
    } finally {
      vi.useRealTimers()
    }
  })

  it('队列可复制成文本，也可导出 m3u8（本地与自定义源不写入文件）', async () => {
    const copied = []
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: async (text) => { copied.push(text) } },
      configurable: true
    })
    const created = []
    const realBlob = window.Blob
    // jsdom 的 Blob 没有 text()：包一层把内容记下来
    window.Blob = class extends realBlob {
      constructor(parts, options) {
        super(parts, options)
        created.push({ text: String(parts?.[0] ?? ''), type: options?.type, blob: this })
      }
    }
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:mock'
    URL.revokeObjectURL = () => {}
    const clicks = []
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, download: this.download }) }
    try {
      const store = await mountPlayer()
      store.playAll([
        song(1, '霓虹海', 240),
        song(2, '云端信使', 240),
        { id: 3, title: '本地文件', artist: '本机', duration: 100, audioUrl: 'blob:x', isLocal: true }
      ], 1)
      await flush()
      host.querySelector('button[aria-label="播放队列"]').click()
      await flush()

      document.querySelector('.queue-copy-text').click()
      await flush()
      expect(copied).toHaveLength(1)
      expect(copied[0]).toBe('1. 霓虹海 — 演示歌手\n2. 云端信使 — 演示歌手\n3. 本地文件 — 本机')

      document.querySelector('.queue-export-m3u').click()
      await flush()
      expect(created).toHaveLength(1)
      expect(created[0].type).toContain('mpegurl')
      expect(clicks).toHaveLength(1)
      expect(clicks[0].download).toMatch(/^music-holo-队列-\d{8}-\d{4}\.m3u8$/)
      expect(created[0].text).toContain('/audio/1.wav')
      expect(created[0].text).not.toContain('blob:x') // 本地地址只在本次会话有效

      // 队列里全是本地文件时明确提示，而不是导出一个打不开的空文件
      created.length = 0
      clicks.length = 0
      store.playAll([{ id: 9, title: '本地文件', artist: '本机', duration: 100, audioUrl: 'blob:x', isLocal: true }], 9)
      await flush()
      document.querySelector('.queue-export-m3u').click()
      await flush()
      expect(created).toHaveLength(0)
    } finally {
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
      window.Blob = realBlob
      HTMLAnchorElement.prototype.click = realClick
      delete window.navigator.clipboard
    }
  })

  it('队列条目可用键盘操作：回车播放、Delete 移除、Alt+方向键移动', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋')], 1)
    await flush()
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()

    const rows = () => Array.from(document.querySelectorAll('.queue-item'))
    expect(rows()[0].getAttribute('role')).toBe('option')
    expect(rows()[0].getAttribute('tabindex')).toBe('0')
    expect(rows()[0].getAttribute('aria-selected')).toBe('true')

    const press = (row, key, init = {}) => row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))

    press(rows()[2], 'Enter')
    await flush()
    expect(store.currentSong.title).toBe('全息之恋')

    press(rows()[0], 'Delete')
    await flush()
    expect(store.queue.map((item) => item.title)).toEqual(['云端信使', '全息之恋'])

    press(rows()[1], 'ArrowUp', { altKey: true })
    await flush()
    expect(store.queue.map((item) => item.title)).toEqual(['全息之恋', '云端信使'])
    // 移动后焦点跟随到新位置，避免键盘用户丢失上下文。
    expect(document.activeElement?.textContent).toContain('全息之恋')
  })

  it('队列条目支持拖拽排序，搜索过滤时禁用拖拽', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋')], 1)
    await flush()
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()

    const rows = () => Array.from(document.querySelectorAll('.queue-item'))
    const fire = (row, type) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      event.dataTransfer = { setData () {}, getData: () => '', effectAllowed: '' }
      row.dispatchEvent(event)
      return event
    }

    expect(rows()[0].getAttribute('draggable')).toBe('true')
    fire(rows()[0], 'dragstart')
    await flush()
    expect(rows()[0].classList.contains('dragging')).toBe(true)

    fire(rows()[2], 'dragover')
    await flush()
    expect(rows()[2].classList.contains('drop-target')).toBe(true)

    fire(rows()[2], 'drop')
    await flush()
    expect(store.queue.map((item) => item.title)).toEqual(['云端信使', '全息之恋', '霓虹海'])
    expect(document.querySelectorAll('.queue-item.dragging')).toHaveLength(0)

    const search = document.querySelector('.queue-search input')
    search.value = '云端'
    search.dispatchEvent(new Event('input'))
    await flush()
    expect(document.querySelector('.queue-item').getAttribute('draggable')).toBe('false')
    expect(document.querySelector('.queue-hint').textContent).toContain('清空搜索框后可拖动排序')
  })

  it('空间音效不可用时回退原声，且不会因为一次失败就丢掉记住的偏好', async () => {
    const store = await mountPlayer()
    store.setSpatialPreferred(true)
    store.playAll([song(1, '霓虹海')], 1)
    await flush()

    // 手动点一次：不支持就提示，但偏好仍然保留（换设备/环境后还能自动套用）。
    host.querySelector('button[aria-label="开启 3D 空间音效"]').click()
    await flush()
    expect(store.spatialPreferred).toBe(true)
    expect(host.querySelector('button[aria-label="开启 3D 空间音效"]')).toBeTruthy()

    // 用户手势之后的播放会尝试自动套用：失败也必须用原声继续播。
    const [nativeAudio, spatialAudio] = document.querySelectorAll('audio')
    store.playing = false
    await flush()
    window.dispatchEvent(new Event('pointerdown'))
    store.playing = true
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(nativeAudio.__playCalls || 0).toBeGreaterThan(0)
    expect(spatialAudio.__playCalls || 0).toBe(0)
    expect(store.spatialPreferred).toBe(true)
    expect(store.playing).toBe(true)
  })

  it('关掉空间音效会同时清掉偏好，下次不会再自动套用', async () => {
    const store = await mountPlayer()
    store.setSpatialPreferred(true)
    expect(JSON.parse(localStorage.getItem('mh_player')).spatialPreferred).toBe(true)
    store.setSpatialPreferred(false)
    expect(JSON.parse(localStorage.getItem('mh_player')).spatialPreferred).toBe(false)
  })

  it('播放器形态按钮在 标准 / 迷你 / 沉浸 之间循环，并同步页面留白', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海')], 1)
    await flush()

    const bar = () => host.querySelector('.player-bar')
    const modeButton = () => host.querySelector('.pb-view-mode')
    expect(modeButton().getAttribute('aria-label')).toBe('播放器形态：标准，点击切换到迷你')
    expect(document.documentElement.classList.contains('mh-player-mini')).toBe(false)

    modeButton().click()
    await flush()
    expect(store.playerViewMode).toBe('mini')
    expect(bar().classList.contains('is-mini')).toBe(true)
    expect(bar().classList.contains('is-compact')).toBe(true)
    // 迷你形态下页面底部留白跟着收窄（--player-h 由 <html> 上的类控制）。
    expect(document.documentElement.classList.contains('mh-player-mini')).toBe(true)

    modeButton().click()
    await flush()
    // 第三种形态是全屏播放页：大封面 + 当前队列，播放条仍然收窄。
    expect(store.playerViewMode).toBe('stage')
    expect(bar().classList.contains('is-stage')).toBe(true)
    expect(host.querySelector('.now-playing')).toBeTruthy()

    modeButton().click()
    await flush()
    expect(store.playerViewMode).toBe('immersive')
    expect(bar().classList.contains('is-immersive')).toBe(true)
    // 沉浸形态自动打开沉浸式歌词舞台。
    expect(store.lyricVisible).toBe(true)
    expect(store.lyricView.immersive).toBe(true)

    modeButton().click()
    await flush()
    expect(store.playerViewMode).toBe('standard')
    expect(host.querySelector('.now-playing')).toBeNull()
    expect(store.lyricView.immersive).toBe(false)
    expect(store.lyricVisible).toBe(false)
    expect(document.documentElement.classList.contains('mh-player-mini')).toBe(false)
  })

  it('V 键切换形态；歌词舞台里退出沉浸会让播放器回到标准形态', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海')], 1)
    await flush()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))
    await flush()
    expect(store.playerViewMode).toBe('mini')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', bubbles: true }))
    await flush()
    expect(store.playerViewMode).toBe('stage')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))
    await flush()
    expect(store.playerViewMode).toBe('immersive')

    // 模拟歌词面板里按 Esc 退出沉浸：播放器形态必须跟着回退，否则状态会打架。
    store.setLyricView({ immersive: false })
    await flush()
    expect(store.playerViewMode).toBe('standard')
  })

  it('播放页显示大封面与当前队列，可点队列切歌，Esc 退出', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋')], 1)
    await flush()
    store.setPlayerViewMode('stage')
    await flush()

    const stage = host.querySelector('.now-playing')
    expect(stage).toBeTruthy()
    expect(stage.querySelector('.np-title').textContent.trim()).toBe('霓虹海')
    const rows = Array.from(stage.querySelectorAll('.np-queue-item'))
    expect(rows).toHaveLength(3)
    expect(rows[0].classList.contains('active')).toBe(true)
    expect(rows[0].textContent).toContain('霓虹海')

    rows[2].querySelector('.np-queue-play').click()
    await flush()
    expect(store.currentSong.title).toBe('全息之恋')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(store.playerViewMode).toBe('standard')
    expect(host.querySelector('.now-playing')).toBeNull()
  })

  it('迷你形态隐藏次要控件、保留核心控制与形态切换入口', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海')], 1)
    await flush()

    const bar = host.querySelector('.player-bar')
    // 停靠控件是迷你形态专属入口，比较时排除掉。
    const controlsInBar = () => bar.querySelectorAll('.pb-right > *:not(.pb-dock)').length
    const before = controlsInBar()
    store.setPlayerViewMode('mini')
    await flush()

    // 次要控件只是被 CSS 隐藏，节点仍然在：切换形态不该打断正在进行的交互。
    expect(controlsInBar()).toBe(before)
    expect(bar.classList.contains('is-compact')).toBe(true)
    // 核心控制与形态切换入口始终保留。
    expect(bar.querySelector('.pb-view-mode')).toBeTruthy()
    expect(bar.querySelector('.pb-mute')).toBeTruthy()
    expect(bar.querySelector('button[aria-label="播放队列"]')).toBeTruthy()
    expect(bar.querySelector('.pb-play')).toBeTruthy()
    expect(bar.querySelector('.progress-track')).toBeTruthy()
  })

  it('迷你形态可切换停靠位置，贴边时不再占用底部空间', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海')], 1)
    await flush()
    store.setPlayerViewMode('mini')
    await flush()

    const bar = host.querySelector('.player-bar')
    expect(bar.querySelector('.pb-grip')).toBeTruthy()
    expect(document.documentElement.classList.contains('mh-player-dock-left')).toBe(false)

    store.setPlayerBarDock('left')
    await flush()
    expect(bar.classList.contains('dock-left')).toBe(true)
    expect(document.documentElement.classList.contains('mh-player-dock-left')).toBe(true)
    expect(document.documentElement.classList.contains('mh-player-mini')).toBe(true)

    store.setPlayerBarDock('right')
    await flush()
    expect(bar.classList.contains('dock-right')).toBe(true)
    expect(document.documentElement.classList.contains('mh-player-dock-left')).toBe(false)
    expect(document.documentElement.classList.contains('mh-player-dock-right')).toBe(true)

    // 非法值回落吸底；回到标准形态后不再贴边。
    expect(store.setPlayerBarDock('top')).toBe('bottom')
    store.setPlayerViewMode('standard')
    await flush()
    expect(document.documentElement.classList.contains('mh-player-dock-right')).toBe(false)
  })

  it('贴边停靠时鼠标离开会自动淡出，进入或聚焦立刻恢复', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      store.playAll([song(1, '霓虹海')], 1)
      await flush()
      store.setPlayerViewMode('mini')
      store.setPlayerBarDock('left')
      await flush()

      const bar = host.querySelector('.player-bar')
      expect(bar.classList.contains('is-faded')).toBe(false)
      bar.dispatchEvent(new Event('pointerleave'))
      expect(bar.classList.contains('is-faded')).toBe(false)
      vi.advanceTimersByTime(3100)
      await flush()
      expect(bar.classList.contains('is-faded')).toBe(true)

      bar.dispatchEvent(new Event('pointerenter'))
      await flush()
      expect(bar.classList.contains('is-faded')).toBe(false)

      // 关掉自动隐藏后不再淡出。
      store.setPlayerBarAutoHide(false)
      bar.dispatchEvent(new Event('pointerleave'))
      vi.advanceTimersByTime(5000)
      await flush()
      expect(bar.classList.contains('is-faded')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('队列多选：连选、批量排到下一首、移到队首与移除', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋'), song(4, '极光列车')], 1)
    await flush()
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()

    const rows = () => Array.from(document.querySelectorAll('.queue-item'))
    expect(document.querySelector('.queue-select-toggle')).toBeTruthy()
    // 非多选模式下点行仍然是播放。
    rows()[2].click()
    await flush()
    expect(store.currentSong.title).toBe('全息之恋')

    document.querySelector('.queue-select-toggle').click()
    await flush()
    expect(document.querySelectorAll('.queue-checkbox')).toHaveLength(4)
    expect(document.querySelector('.queue-batch')).toBeTruthy()

    // Shift 连选：从第 1 首连到第 3 首。
    rows()[0].click()
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    await flush()
    expect(document.querySelector('.queue-batch-note').textContent).toContain('已选 3 首')
    expect(document.querySelectorAll('.queue-item.selected')).toHaveLength(3)

    document.querySelector('.queue-batch .el-button--danger').click()
    await flush()
    // 所选为前 3 首，移除后只剩第 4 首。
    expect(store.queue.map((item) => item.title)).toEqual(['极光列车'])
    expect(document.querySelector('.queue-batch-note').textContent).toContain('已选 0 首')

    // 退出多选后恢复普通点击播放。
    document.querySelector('.queue-select-toggle').click()
    await flush()
    expect(document.querySelectorAll('.queue-checkbox')).toHaveLength(0)
    expect(document.querySelector('.queue-batch')).toBeNull()
    rows()[0].click()
    await flush()
    expect(store.currentSong.title).toBe('极光列车')
  })

  it('批量“排到下一首”把所选插到当前曲目之后', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '全息之恋'), song(4, '极光列车')], 1)
    await flush()
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    document.querySelector('.queue-select-toggle').click()
    await flush()

    const rows = () => Array.from(document.querySelectorAll('.queue-item'))
    // 选中第 4 首（下标 3），排到当前曲目（霓虹海，下标 0）之后。
    rows()[3].click()
    await flush()
    const nextButton = [...document.querySelectorAll('.queue-batch-actions .el-button')]
      .find((button) => button.textContent.trim() === '排到下一首')
    nextButton.click()
    await flush()
    expect(store.queue.map((item) => item.title)).toEqual(['霓虹海', '极光列车', '云端信使', '全息之恋'])
  })

  it('交叉淡入：切歌时新音轨在空闲元素上淡入，旧音轨淡出后才暂停', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使')], 1)
    await flush()
    store.setCrossfade(60)
    await flush()

    const [nativeAudio, spatialAudio] = document.querySelectorAll('audio')
    // 原声模式下第二个元素空闲：切歌时它接手新曲目，旧曲目继续播完淡出。
    expect(spatialAudio.__playCalls || 0).toBe(0)

    store.next()
    await flush()
    expect(spatialAudio.__playCalls || 0).toBeGreaterThan(0)
    expect(spatialAudio.getAttribute('src')).toBe('/audio/2.wav')
    expect(spatialAudio.volume).toBeLessThan(store.volume)
    // 淡出还没结束，旧音轨仍在播放（没有 pause）。
    expect(nativeAudio.__pauseCalls || 0).toBe(0)

    // 等淡入淡出结束（60ms + 余量）。
    await new Promise((resolve) => setTimeout(resolve, 260))
    await flush()
    expect(nativeAudio.__pauseCalls || 0).toBeGreaterThan(0)
    expect(spatialAudio.volume).toBeCloseTo(store.volume, 2)
    // 新音轨成为当前元素：进度事件只认它。
    expect(store.currentSong.title).toBe('云端信使')
  })

  it('淡变途中改音量：不打断曲线，淡变结束后补上新音量', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      store.setVolume(0.8)
      store.playAll([song(1, '霓虹海'), song(2, '云端信使')], 1)
      store.setCrossfade(60)
      await flush()

      const [nativeAudio, spatialAudio] = document.querySelectorAll('audio')
      store.next()
      await flush()
      vi.advanceTimersByTime(20)
      await flush()
      // 淡入进行中：新音轨音量还在往上爬，还没到目标 0.8
      expect(spatialAudio.volume).toBeLessThan(0.8)

      // 途中把音量改成 0.2：不能当场把曲线打平（新音轨仍按原曲线爬），也不能丢掉这次调整
      store.setVolume(0.2)
      await flush()
      expect(spatialAudio.volume).not.toBeCloseTo(0.2, 2)
      expect(spatialAudio.volume).toBeLessThan(0.8)

      // 淡变结束后补同步：新音轨停在 0.2
      vi.advanceTimersByTime(200)
      await flush()
      expect(spatialAudio.volume).toBeCloseTo(0.2, 2)
      expect(nativeAudio.__pauseCalls || 0).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('新音轨起播失败时，旧音轨的音量要还原（别留下一首变小声的歌）', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      store.setVolume(0.7)
      store.playAll([song(1, '霓虹海'), song(2, '云端信使')], 1)
      store.setCrossfade(60)
      await flush()

      const [nativeAudio, spatialAudio] = document.querySelectorAll('audio')
      // 新音轨淡出开始一会儿后才起播失败：这时旧音轨已经被淡到一半
      spatialAudio.play = () => new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('起播失败')), 30)
      })
      store.next()
      await flush()
      vi.advanceTimersByTime(20)
      await flush()
      expect(nativeAudio.volume).toBeLessThan(0.7) // 确实淡到一半了

      vi.advanceTimersByTime(60) // 起播失败回调执行
      await flush()
      expect(nativeAudio.volume).toBeCloseTo(0.7, 2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('关闭交叉淡入时立即切源，不做淡入淡出', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使')], 1)
    await flush()
    store.setCrossfade(0)
    await flush()

    const [nativeAudio, spatialAudio] = document.querySelectorAll('audio')
    store.next()
    await flush()
    expect(nativeAudio.getAttribute('src')).toBe('/audio/2.wav')
    expect(spatialAudio.__playCalls || 0).toBe(0)
    expect(nativeAudio.volume).toBeCloseTo(store.volume, 2)
  })

  it('会话续播：冷启动提示上一次的队列，确认后恢复，忽略后不再出现', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海'), song(2, '云端信使'), song(3, '极光列车')], 2)
    await flush()
    store.currentTime = 96
    store.saveSessionSnapshot({ now: Date.now() })
    await flush()
    expect(document.querySelector('.session-resume')).toBeNull() // 队列还在播放时不打扰

    // 模拟冷启动：关掉组件（保留 localStorage）再挂一次。
    app.unmount()
    await flush()
    dropPersistedQueue()
    const restarted = await mountPlayer()
    await flush()
    const banner = document.querySelector('.session-resume')
    expect(banner).not.toBeNull()
    expect(banner.textContent).toContain('3 首')
    expect(banner.textContent).toContain('第 2 首')
    expect(banner.textContent).toContain('01:36')

    // 没有「按 id 取曲目」的解析器时不能假装成功：给出明确提示并丢弃快照。
    setSessionSongResolver(null)
    banner.querySelector('.session-resume-btn.primary').click()
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(document.querySelector('.session-resume')).toBeNull()
    expect(restarted.sessionSnapshot).toBeNull()

    // 注册解析器后可真正恢复队列与模式。
    const library = [song(1, '霓虹海'), song(2, '云端信使'), song(3, '极光列车')]
    setSessionSongResolver((ids) => ids.map((id) => library.find((item) => item.id === id)).filter(Boolean))
    restarted.playAll(library, 2)
    restarted.currentTime = 96
    restarted.saveSessionSnapshot({ now: Date.now() })
    app.unmount()
    dropPersistedQueue() // 冷启动：曲目对象不在本地，只剩会话快照
    await flush()
    const second = await mountPlayer()
    await flush()
    const secondBanner = document.querySelector('.session-resume')
    expect(secondBanner).not.toBeNull()
    secondBanner.querySelector('.session-resume-btn.primary').click()
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flush()
    expect(second.queue.map((item) => item.id)).toEqual([1, 2, 3])
    expect(second.currentSong.title).toBe('云端信使')
    expect(document.querySelector('.session-resume')).toBeNull()
    setSessionSongResolver(null)
  })

  it('收听统计：起播/切走/播完/失败分别入账，面板展示并可清空', async () => {
    const store = await mountPlayer()
    const stats = useStatsStore()
    stats.clear()
    store.playAll([song(1, '霓虹海', 240), song(2, '云端信使', 240), song(3, '极光列车', 240)], 1)
    await flush()
    expect(stats.events.filter((item) => item.type === 'play')).toHaveLength(1)
    expect(stats.events[0]).toMatchObject({ type: 'play', title: '霓虹海', duration: 240 })

    // 中途切走：按实际进度记 skip（jsdom 里 currentTime 为 0，模拟听到 30 秒）
    const [nativeAudio] = document.querySelectorAll('audio')
    nativeAudio.currentTime = 30
    nativeAudio.dispatchEvent(new Event('timeupdate'))
    await flush()
    store.next()
    await flush()
    expect(stats.events.filter((item) => item.type === 'skip')).toHaveLength(1)
    expect(stats.events.find((item) => item.type === 'skip')).toMatchObject({ title: '霓虹海', position: 30 })
    expect(stats.events.filter((item) => item.type === 'play')).toHaveLength(2)

    // 自然播完：记 complete，且不会同时被记成 skip
    store.playSong?.(song(9, '收尾曲', 100))
    store.playAll([song(9, '收尾曲', 100)], 9)
    await flush()
    const [audio2] = document.querySelectorAll('audio')
    audio2.dispatchEvent(new Event('ended'))
    await flush()
    const completes = stats.events.filter((item) => item.type === 'complete')
    expect(completes).toHaveLength(1)
    expect(completes[0].title).toBe('收尾曲')
    expect(stats.events.filter((item) => item.type === 'skip' && item.title === '收尾曲')).toHaveLength(0)

    // 播放失败：记 error 并带上来源标签
    audio2.dispatchEvent(new Event('error'))
    await flush()
    const errors = stats.events.filter((item) => item.type === 'error')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.at(-1).source).toBeTruthy()

    // 统计面板：累计时长与 Top 曲目渲染出来，清空后归零
    const statsButton = document.querySelector('.pb-stats')
    expect(statsButton).not.toBeNull()
    statsButton.click()
    await flush()
    await flush()
    const panel = document.querySelector('.stats-panel')
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('累计')
    expect(panel.textContent).toContain('听得最多的曲目')
    panel.querySelector('.stats-clear').click()
    await flush()
    expect(useStatsStore().events).toEqual([])
  })

  it('响度归一化：默认不补偿，实测后按目标响度缩放音量', async () => {
    const store = await mountPlayer()
    const loudness = useLoudnessStore()
    loudness.clear()
    loudness.setTarget('streaming')
    store.playAll([song(1, '霓虹海', 240), song(2, '云端信使', 240)], 1)
    await flush()

    const [nativeAudio] = document.querySelectorAll('audio')
    // 没有实测值：不做任何补偿，音量保持用户设置
    expect(nativeAudio.volume).toBeCloseTo(store.volume, 5)

    // 实测 -26 LUFS、峰值有余量 → 目标 -16 需要 +10dB（×3.16），会顶到 1
    loudness.recordMeasurement(1, { lufs: -26, peak: 0.2 })
    await flush()
    expect(nativeAudio.volume).toBeCloseTo(1, 5) // 0.8 × 3.16 被夹到 1

    // 音量本身调小时补偿按比例缩放
    store.setVolume(0.2)
    await flush()
    expect(nativeAudio.volume).toBeCloseTo(0.2 * Math.pow(10, 10 / 20), 4)

    // 关掉归一化后恢复原始音量
    loudness.setTarget('off')
    await flush()
    expect(nativeAudio.volume).toBeCloseTo(0.2, 5)
  })

  it('跨域/自定义源音源：空间音效与均衡器置灰，不再点出必然失败的提示', async () => {
    const store = await mountPlayer()
    // jsdom 没有 Web Audio：入口先置灰（不能让用户点出个必然失败的提示）
    store.playAll([song(1, '霓虹海')], 1)
    await flush()
    expect(document.querySelector('.pb-spatial').disabled).toBe(true)
    expect(document.querySelector('.pb-equalizer').disabled).toBe(true)

    // 补上 Web Audio 后同源音源的入口恢复可用
    class FakeContext {
      constructor() {
        this.state = 'running'
        this.currentTime = 0
        this.destination = {}
      }
      createMediaElementSource() { return { connect () {} } }
      createChannelSplitter() { return { connect () {} } }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() { return { connect () {}, disconnect () {}, gain: { value: 1, setTargetAtTime (v) { this.value = v } } } }
      createBiquadFilter() {
        return { connect () {}, type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0, setTargetAtTime (v) { this.value = v } } }
      }
      createDynamicsCompressor() {
        return {
          connect () {},
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }
        }
      }
      resume() { this.state = 'running'; return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    window.AudioContext = FakeContext
    store.playAll([song(2, '云端信使')], 2)
    await flush()
    await flush()
    expect(document.querySelector('.pb-spatial').disabled).toBe(false)
    expect(document.querySelector('.pb-equalizer').disabled).toBe(false)

    // 跨域：两个入口重新置灰
    store.playAll([{ ...song(9, '跨域曲目'), audioUrl: 'https://cdn.example/song.wav' }], 9)
    await flush()
    await flush()
    expect(document.querySelector('.pb-spatial').disabled).toBe(true)
    expect(document.querySelector('.pb-equalizer').disabled).toBe(true)
    // 置灰后点击不会开启空间音效
    document.querySelector('.pb-spatial').click()
    await flush()
    expect(store.spatialPreferred).toBe(false)
    delete window.AudioContext
  })

  it('音频上下文被挂起时给出可见的重试入口，点一下恢复', async () => {
    class SuspendedContext {
      constructor() {
        this.state = 'suspended'
        this.currentTime = 0
        this.destination = {}
        this.resumeCalls = 0
      }
      createMediaElementSource() { return { connect () {} } }
      createChannelSplitter() { return { connect () {} } }
      createPanner() { return { connect () {}, positionX: { setValueAtTime () {} } } }
      createGain() { return { connect () {}, disconnect () {}, gain: { value: 1, setTargetAtTime (v) { this.value = v } } } }
      createBiquadFilter() {
        return { connect () {}, type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0, setTargetAtTime (v) { this.value = v } } }
      }
      createDynamicsCompressor() {
        return {
          connect () {},
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }
        }
      }
      resume() {
        this.resumeCalls += 1
        // 模拟“自动 resume 失败”：只有用户手动点重试（真实手势）之后才拉得起来。
        if (window.__allowAudioResume) this.state = 'running'
        return Promise.resolve()
      }
      close() { this.state = 'closed'; return Promise.resolve() }
    }
    window.AudioContext = SuspendedContext
    try {
      const store = await mountPlayer()
      store.playAll([song(1, '霓虹海')], 1)
      store.setSpatialPreferred(true)
      await flush()
      // 用户手势后自动接入处理链路；上下文是挂起状态
      store.playing = false
      await flush()
      window.dispatchEvent(new Event('pointerdown')) // 手势监听挂在 window 上
      store.playing = true
      await flush()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await flush()
      // 处理链路启用后当前播放元素是第二个（空间）元素，两个都派发才覆盖得到
      for (const element of document.querySelectorAll('audio')) element.dispatchEvent(new Event('timeupdate'))
      await flush()
      const retry = document.querySelector('.pb-audio-retry')
      expect(retry).not.toBeNull()
      // 自动 resume 拉不起来：入口还在，并给出说明
      retry.click()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await flush()
      // 处理链路启用后当前播放元素是第二个（空间）元素，两个都派发才覆盖得到
      for (const element of document.querySelectorAll('audio')) element.dispatchEvent(new Event('timeupdate'))
      await flush()
      expect(document.querySelector('.pb-audio-retry')).not.toBeNull()
      // 用户真实手势后再点一次：恢复成功，入口消失
      window.__allowAudioResume = true
      document.querySelector('.pb-audio-retry').click()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await flush()
      // 处理链路启用后当前播放元素是第二个（空间）元素，两个都派发才覆盖得到
      for (const element of document.querySelectorAll('audio')) element.dispatchEvent(new Event('timeupdate'))
      await flush()
      expect(document.querySelector('.pb-audio-retry')).toBeNull()
    } finally {
      delete window.AudioContext
    }
  })

  it('音频加载中断会自动重试（退避三次），仍失败才交回手动重试', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      // 自定义源：跳过“改用本机离线副本”的异步分支，错误路径是同步的
      store.playAll([{ ...song(1, '霓虹海', 240), isCustomSource: true }, song(2, '云端信使', 240)], 1)
      await flush()
      const [nativeAudio] = document.querySelectorAll('audio')
      const failWith = (code) => {
        Object.defineProperty(nativeAudio, 'error', { value: { code }, configurable: true })
        nativeAudio.dispatchEvent(new Event('error'))
      }
      const plays = () => nativeAudio.__playCalls || 0

      // 地址不支持：不自动重试，立刻给出手动重试入口
      failWith(4)
      await flush()
      expect(document.querySelector('.pb-retry')).not.toBeNull()

      // 手动重试清掉错误态，并重新给满三次自动重试机会；失败时播放被按停，这里恢复播放意图
      document.querySelector('.pb-retry').click()
      await flush()
      expect(document.querySelector('.pb-retry')).toBeNull()
      expect(nativeAudio.__loadCalls || 0).toBeGreaterThan(0)
      store.playing = true
      await flush()

      // 网络中断：先自动重试，不立刻弹错误
      failWith(2)
      await flush()
      expect(document.querySelector('.pb-retry')).toBeNull()
      const before = plays()
      vi.advanceTimersByTime(900)
      await flush()
      expect(plays()).toBeGreaterThan(before) // 重试时恢复播放

      // 第二次：仍然自动重试（退避间隔更长）
      failWith(2)
      await flush()
      expect(document.querySelector('.pb-retry')).toBeNull()
      vi.advanceTimersByTime(2600)
      await flush()

      // 第三次：用掉最后一次自动重试
      failWith(2)
      await flush()
      expect(document.querySelector('.pb-retry')).toBeNull()
      vi.advanceTimersByTime(6100)
      await flush()

      // 第四次：超出上限，交回手动重试
      failWith(2)
      await flush()
      expect(document.querySelector('.pb-retry')).not.toBeNull()
      // 之后不再自动重试
      vi.advanceTimersByTime(10000)
      await flush()
      expect(document.querySelector('.pb-retry')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('缓冲卡死会自动重新连接，用尽机会后才提示手动重试', async () => {
    vi.useFakeTimers()
    try {
      const store = await mountPlayer()
      store.playAll([song(1, '霓虹海', 240), song(2, '云端信使', 240)], 1)
      await flush()
      const [nativeAudio] = document.querySelectorAll('audio')
      // jsdom 的 play() 是桩，不会真的把元素切到播放态
      Object.defineProperty(nativeAudio, 'paused', { value: false, configurable: true })
      Object.defineProperty(nativeAudio, 'readyState', { value: 2, configurable: true })
      store.playing = true
      await flush()

      const loads = () => nativeAudio.__loadCalls || 0
      const advance = async (ms) => { vi.advanceTimersByTime(ms); await flush() }

      // 每 2 秒查一次，连续 8 秒没有进展才判定卡死
      const before = loads()
      await advance(3000)
      expect(loads()).toBe(before) // 才 3 秒：还在正常缓冲的容忍范围内
      await advance(7000) // 到第 10 秒判定卡死，排入一次自动重连
      await advance(1000) // 重连真正执行
      expect(loads()).toBeGreaterThan(before)
      expect(document.querySelector('.pb-retry')).toBeNull()

      // 用尽三次机会后，改由用户手动重试（每次重连后依然不前进）
      for (let i = 0; i < 6; i += 1) await advance(12000)
      expect(document.querySelector('.pb-retry')).not.toBeNull()

      // 手动重试后进度恢复推进：不再判定卡死，也不会反复重载
      document.querySelector('.pb-retry').click()
      await flush()
      store.playing = true
      await flush()
      const afterRetry = loads()
      nativeAudio.currentTime = 5
      await advance(4000)
      nativeAudio.currentTime = 9
      await advance(4000)
      expect(loads()).toBe(afterRetry)
    } finally {
      vi.useRealTimers()
    }
  })

  it('顺序播放会预热下一首的元数据，省流量或随机模式不预热', async () => {
    const created = []
    const RealAudio = window.Audio
    window.Audio = function FakeAudio() {
      const element = document.createElement('audio')
      created.push(element)
      return element
    }
    try {
      const store = await mountPlayer()
      store.playAll([song(1, '霓虹海', 240), song(2, '云端信使', 240), song(3, '极光列车', 240)], 1)
      await flush()
      // 顺序播放：预热队里下一首（云端信使）
      expect(created).toHaveLength(1)
      expect(created[0].preload).toBe('metadata')
      expect(created[0].getAttribute('src')).toBe('/audio/2.wav')

      // 切到随机模式：下一首不确定，不再预热
      store.setMode('random')
      await flush()
      expect(created).toHaveLength(1) // 只释放旧的，不新建

      // 省流量模式：即使下一首确定也不预热
      Object.defineProperty(window.navigator, 'connection', { value: { saveData: true }, configurable: true })
      store.setMode('order')
      store.playAll([song(4, 'A', 240), song(5, 'B', 240)], 4)
      await flush()
      expect(created).toHaveLength(1)
      delete window.navigator.connection
    } finally {
      window.Audio = RealAudio
    }
  })
})

describe('队列存为歌单', () => {
  beforeEach(() => {
    localStorage.clear()
    HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
    HTMLMediaElement.prototype.pause = function () {}
    HTMLMediaElement.prototype.load = function () {}
    delete window.AudioContext
    delete window.webkitAudioContext
  })
  afterEach(() => {
    app?.unmount()
    app = null
    host?.remove()
    host = null
    document.body.innerHTML = ''
  })
  beforeEach(() => {
    playlistCalls.save.length = 0
    playlistCalls.addSongs.length = 0
    playlistCalls.page.length = 0
    playlistCalls.added = null
  })

  it('登录后把队列存成新歌单，本地与自定义源歌曲不上传', async () => {
    const store = await mountPlayer()
    const user = useUserStore()
    user.token = 'fake-token'
    try {
      store.playAll([
        song(1, '霓虹海', 240),
        song(2, '云端信使', 240),
        { id: 3, title: '本地文件', artist: '本机', duration: 100, audioUrl: 'blob:x', isLocal: true },
        song(1, '霓虹海', 240) // 重复项
      ], 1)
      await flush()
      host.querySelector('button[aria-label="播放队列"]').click()
      await flush()

      document.querySelector('.queue-save-playlist').click()
      await flush()
      // 弹出命名框：默认名带时间，改成自己想要的名字后确认
      const box = document.querySelector('.el-message-box')
      expect(box).toBeTruthy()
      const input = box.querySelector('input')
      input.value = '我的深夜队列'
      input.dispatchEvent(new Event('input'))
      await flush()
      box.querySelector('.el-button--primary').click()
      await flush()
      await flush()

      expect(playlistCalls.save).toEqual([{ name: '我的深夜队列' }])
      expect(playlistCalls.addSongs).toEqual([[99, [1, 2]]]) // 去重、且不含本地文件
      await wait(60)
      expect(document.querySelector('.el-message-box')).toBeNull() // 确认后关闭，不留残留在页面上
    } finally {
      user.token = ''
    }
  })

  it('未登录或队列里没有可保存的歌曲时不发请求', async () => {
    await wait(60) // 等上一个用例的命名框动画收干净
    expect(document.querySelector('.el-message-box')).toBeNull()
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海', 240)], 1)
    await flush()
    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    document.querySelector('.queue-save-playlist').click()
    await flush()
    expect(document.querySelector('.el-message-box')).toBeNull() // 未登录：只提示，不弹命名框
    expect(playlistCalls.save).toHaveLength(0)

    const user = useUserStore()
    user.token = 'fake-token'
    try {
      store.playAll([
        { id: 5, title: '本地文件', artist: '本机', duration: 100, audioUrl: 'blob:x', isLocal: true }
      ], 5)
      await flush()
      document.querySelector('.queue-save-playlist').click()
      await flush()
      expect(document.querySelector('.el-message-box')).toBeNull()
      expect(playlistCalls.save).toHaveLength(0)
    } finally {
      user.token = ''
    }
  })
})

  it('选中的队列歌曲可加入已有歌单，本地文件不上传', async () => {
    const store = await mountPlayer()
    const user = useUserStore()
    user.token = 'fake-token'
    try {
      store.playAll([
        song(1, '霓虹海', 240),
        song(2, '云端信使', 240),
        { id: 3, title: '本地文件', artist: '本机', duration: 100, audioUrl: 'blob:x', isLocal: true }
      ], 1)
      await flush()
      host.querySelector('button[aria-label="播放队列"]').click()
      await flush()
      document.querySelector('.queue-select-toggle').click()
      await flush()

      const rows = () => Array.from(document.querySelectorAll('.queue-item'))
      rows()[0].click()
      rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
      await flush()
      expect(document.querySelector('.queue-batch-note').textContent).toContain('已选 3 首')

      document.querySelector('.queue-add-playlist').click()
      await flush()
      await flush()
      expect(playlistCalls.page).toEqual([{ pageNum: 1, pageSize: 50, onlyMine: true }])

      const dialog = document.querySelector('.el-dialog')
      expect(dialog).toBeTruthy()
      const radios = Array.from(dialog.querySelectorAll('input[type="radio"]'))
      expect(radios).toHaveLength(2)
      radios[1].click() // 通勤清单
      await flush()
      dialog.querySelector('.queue-add-playlist-confirm').click()
      await flush()
      await flush()

      expect(playlistCalls.addSongs).toEqual([[8, [1, 2]]]) // 本地那首不上传
      await wait(60)
      // 加入成功后弹窗关闭（Element Plus 是给外层 overlay 加 display:none）
      expect(document.querySelector('.el-dialog')?.closest('.el-overlay')?.style.display).toBe('none')
    } finally {
      user.token = ''
    }
  })

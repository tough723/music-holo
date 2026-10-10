import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import PlayerBar from '../src/components/PlayerBar.vue'
import { usePlayerStore, setSessionSongResolver } from '../src/store/player.js'

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
    HTMLMediaElement.prototype.load = () => {}
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
})

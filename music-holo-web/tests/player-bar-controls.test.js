import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import PlayerBar from '../src/components/PlayerBar.vue'
import { usePlayerStore } from '../src/store/player.js'

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

describe('底部播放器交互', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom 不实现媒体播放，桩掉这三个方法避免“Not implemented”噪声。
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    HTMLMediaElement.prototype.pause = () => {}
    HTMLMediaElement.prototype.load = () => {}
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
})

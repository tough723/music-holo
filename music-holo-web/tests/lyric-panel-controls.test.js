import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import {
  LYRIC_OFFSET_LIMIT_MS,
  LYRIC_OFFSET_STEP_MS,
  normalizeLyricView,
  usePlayerStore
} from '../src/store/player.js'
import LyricPanel from '../src/components/LyricPanel.vue'

/**
 * 歌词舞台：显示偏好（译文/罗马音/逐字/沉浸/字号）改由 store 承载并持久化，
 * 并提供歌词与音频的时间校准；这里用真实组件挂载（jsdom）验证交互而不是重复 store 单测。
 */
let app = null
let host = null

const song = (id, title) => ({
  id,
  title,
  singerName: '演示歌手',
  album: '演示专辑',
  cover: '',
  duration: 240,
  audioUrl: `/audio/${id}.wav`
})

async function mountLyricPanel() {
  const pinia = createPinia()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(LyricPanel)
  app.use(pinia).use(ElementPlus)
  for (const [name, component] of Object.entries(ElementPlusIconsVue)) app.component(name, component)
  app.mount(host)
  await nextTick()
  return usePlayerStore(pinia)
}

const flush = async () => { await nextTick(); await nextTick() }

const clickText = (selector, text) => {
  const node = [...host.querySelectorAll(selector)].find((item) => item.textContent.trim() === text)
  if (!node) throw new Error(`未找到按钮：${text}`)
  node.click()
  return node
}

describe('歌词显示偏好', () => {
  beforeEach(() => {
    localStorage.clear()
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

  it('默认偏好：显示译文与逐字、隐藏罗马音、中等字号、无校准', () => {
    const view = normalizeLyricView()
    expect(view).toMatchObject({
      showTranslation: true,
      showRomaji: false,
      showVerbatim: true,
      immersive: false,
      fontSize: 'medium',
      offsetMs: 0
    })
    // 脏数据一律收敛：非法字号回落到 medium，偏移夹在上下限内。
    expect(normalizeLyricView({ fontSize: 'huge', offsetMs: 99999 })).toMatchObject({
      fontSize: 'medium',
      offsetMs: LYRIC_OFFSET_LIMIT_MS
    })
    // 只有显式 false 才算关闭，避免 0 / '' 之类脏值被误判成用户偏好。
    expect(normalizeLyricView({ offsetMs: -99999, showTranslation: false })).toMatchObject({
      offsetMs: -LYRIC_OFFSET_LIMIT_MS,
      showTranslation: false
    })
    expect(normalizeLyricView({ showTranslation: 0, showRomaji: 'no' }).showTranslation).toBe(true)
    expect(normalizeLyricView({ showRomaji: true }).showRomaji).toBe(true)
  })

  it('偏好写入 store 并跨会话保留（重新初始化 store 仍能读回）', async () => {
    const store = await mountLyricPanel()
    store.setLyricView({ showTranslation: false, showRomaji: true, fontSize: 'large' })
    expect(store.lyricView).toMatchObject({ showTranslation: false, showRomaji: true, fontSize: 'large' })

    const raw = JSON.parse(localStorage.getItem('mh_player') || '{}')
    expect(raw.lyricView).toMatchObject({ showTranslation: false, showRomaji: true, fontSize: 'large' })

    const reloaded = usePlayerStore(createPinia())
    expect(reloaded.lyricView).toMatchObject({ showTranslation: false, showRomaji: true, fontSize: 'large' })
  })

  it('时间校准可微调、到达上限后夹紧、并可一键重置', async () => {
    const store = await mountLyricPanel()
    expect(store.adjustLyricOffset(LYRIC_OFFSET_STEP_MS)).toBe(500)
    expect(store.adjustLyricOffset(LYRIC_OFFSET_STEP_MS)).toBe(1000)
    expect(store.lyricView.offsetMs).toBe(1000)

    store.adjustLyricOffset(99999)
    expect(store.lyricView.offsetMs).toBe(LYRIC_OFFSET_LIMIT_MS)
    store.adjustLyricOffset(-99999)
    expect(store.lyricView.offsetMs).toBe(-LYRIC_OFFSET_LIMIT_MS)
    expect(store.adjustLyricOffset(Number.NaN)).toBe(-LYRIC_OFFSET_LIMIT_MS)

    expect(store.resetLyricOffset()).toBe(0)
    expect(store.lyricView.offsetMs).toBe(0)
    expect(JSON.parse(localStorage.getItem('mh_player')).lyricView.offsetMs).toBe(0)
  })

  it('面板上的字号与时间校准按钮即时生效', async () => {
    const store = await mountLyricPanel()
    store.lyricVisible = true
    store.playAll([song(1, '霓虹海')], 1)
    store.lyrics = [{ time: 0, text: '第一行' }, { time: 12, text: '第二行' }]
    await flush()

    clickText('.view-tool', '大')
    await flush()
    expect(store.lyricView.fontSize).toBe('large')
    expect(host.querySelector('.view-tool.active').textContent.trim()).toBe('大')

    clickText('.view-tool', '+0.5s')
    await flush()
    expect(store.lyricView.offsetMs).toBe(500)
    expect(host.querySelector('.view-offset').textContent.trim()).toBe('校准 +0.5s')

    clickText('.view-tool', '−0.5s')
    clickText('.view-tool', '−0.5s')
    await flush()
    expect(store.lyricView.offsetMs).toBe(-500)
    expect(host.querySelector('.view-offset').textContent.trim()).toBe('校准 −0.5s')

    clickText('.view-tool', '重置')
    await flush()
    expect(store.lyricView.offsetMs).toBe(0)
    expect(host.querySelector('.view-offset').textContent.trim()).toBe('校准 0.0s')
  })

  it('[ / ] 快捷键校准歌词时间，Escape 关闭面板', async () => {
    const store = await mountLyricPanel()
    store.lyricVisible = true
    store.playAll([song(1, '霓虹海')], 1)
    store.lyrics = [{ time: 0, text: '第一行' }, { time: 12, text: '第二行' }]
    await flush()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }))
    await flush()
    expect(store.lyricView.offsetMs).toBe(LYRIC_OFFSET_STEP_MS)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }))
    await flush()
    expect(store.lyricView.offsetMs).toBe(-LYRIC_OFFSET_STEP_MS)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    expect(store.lyricVisible).toBe(false)
  })

  it('偏移会提前/延后高亮行，点击歌词行按偏移换算回真实播放时间', async () => {
    const store = await mountLyricPanel()
    store.lyricVisible = true
    store.playAll([song(1, '霓虹海')], 1)
    store.lyrics = [{ time: 10, text: '第一行' }, { time: 20, text: '第二行' }]
    store.currentTime = 9.6
    store.duration = 240
    await flush()

    const lines = () => [...host.querySelectorAll('.lyric-line')]
    expect(lines()[0].classList.contains('active')).toBe(false)

    // 校准 +500ms：播放到 9.6s 时按 10.1s 判定，第一行提前高亮。
    store.adjustLyricOffset(LYRIC_OFFSET_STEP_MS)
    await flush()
    expect(lines()[0].classList.contains('active')).toBe(true)

    const events = []
    const onSeek = (event) => events.push(event.detail)
    window.addEventListener('mh-seek', onSeek)
    try {
      lines()[1].click()
      await flush()
      // 第二行在 20s，校准 +0.5s 意味着音频走到 19.5s 时它就该高亮。
      expect(events).toEqual([19.5])
    } finally {
      window.removeEventListener('mh-seek', onSeek)
    }
  })

  it('歌词为空时提供重新加载入口，点击会重新解析歌词', async () => {
    const store = await mountLyricPanel()
    store.lyricVisible = true
    store.playAll([song(7, '无词之歌')], 7)
    store.lyrics = []
    await flush()

    const reload = [...host.querySelectorAll('.lyric-empty .el-button')]
      .find((item) => item.textContent.trim() === '重新加载歌词')
    expect(reload).toBeTruthy()

    let calls = 0
    const original = store.loadLyrics
    store.loadLyrics = async (target) => {
      calls += 1
      expect(target.id).toBe(7)
      store.lyrics = [{ time: 0, text: '迟到的歌词' }]
    }
    try {
      reload.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
      await flush()
      expect(calls).toBe(1)
      expect(host.querySelector('.lyric-line')?.textContent).toContain('迟到的歌词')
    } finally {
      store.loadLyrics = original
    }
  })

  it('偏好跨“关闭再打开”保留：隐藏译文后重开面板仍是隐藏状态', async () => {
    const store = await mountLyricPanel()
    store.lyricVisible = true
    store.playAll([song(1, '霓虹海')], 1)
    store.lyrics = [{ time: 0, text: '第一行' }]
    store.lyricTranslations = [{ time: 0, text: 'Line one' }]
    await flush()

    clickText('.translation-toggle', '隐藏译文')
    await flush()
    expect(store.lyricView.showTranslation).toBe(false)

    store.lyricVisible = false
    await flush()
    store.lyricVisible = true
    await flush()
    const toggles = [...host.querySelectorAll('.translation-toggle')].map((item) => item.textContent.trim())
    expect(toggles[0]).toBe('显示译文')
    expect(host.querySelector('.line-translation')).toBeNull()
  })
})

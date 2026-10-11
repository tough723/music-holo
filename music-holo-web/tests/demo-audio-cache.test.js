import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/**
 * 离线副本（本机保存的演示音频）用 blob URL 播放，删除时会 revoke 掉这个 URL。
 * 这里验证“删掉正在播放的副本”不会让播放断掉：音源会被切回在线地址并继续播放。
 * IndexedDB 在 jsdom 里不存在，因此把缓存模块替换成可控的内存实现。
 */
const deletedPaths = []
const cachedPaths = new Set(['/audio/1.wav'])
let objectUrlCounter = 0

vi.mock('../src/utils/demoAudioCache', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listCachedDemoAudio: async () => [...cachedPaths].map((path) => ({
      path,
      title: path === '/audio/1.wav' ? '霓虹海' : path,
      songId: null,
      bytes: 2048,
      savedAt: 1
    })),
    hasCachedDemoAudio: async (url, baseHref) => cachedPaths.has(actual.demoAudioPath(url, baseHref)),
    deleteCachedDemoAudio: async (path) => {
      deletedPaths.push(path)
      cachedPaths.delete(path)
    },
    saveOwnDemoAudio: async (song, baseHref) => ({ path: actual.demoAudioPath(song.audioUrl, baseHref), bytes: 2048 })
  }
})

const PlayerBar = (await import('../src/components/PlayerBar.vue')).default
const { usePlayerStore } = await import('../src/store/player.js')

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

describe('离线副本与播放的衔接', () => {
  beforeEach(() => {
    localStorage.clear()
    deletedPaths.length = 0
    cachedPaths.clear()
    cachedPaths.add('/audio/1.wav')
    objectUrlCounter = 0
    // jsdom 没有 createObjectURL，桩一个可辨识的 blob: 地址。
    URL.createObjectURL = () => `blob:mock/${++objectUrlCounter}`
    URL.revokeObjectURL = () => {}
    HTMLMediaElement.prototype.play = function () {
      this.__playCalls = (this.__playCalls || 0) + 1
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      this.__pauseCalls = (this.__pauseCalls || 0) + 1
    }
    HTMLMediaElement.prototype.load = () => {}
  })
  afterEach(() => {
    app?.unmount()
    app = null
    host?.remove()
    host = null
    document.body.innerHTML = ''
  })

  it('删除正在播放的离线副本时切回在线音源，播放不中断', async () => {
    const store = await mountPlayer()
    store.playAll([song(1, '霓虹海')], 1)
    store.currentTime = 42
    await flush()

    const [nativeAudio] = document.querySelectorAll('audio')
    // 模拟“网络不可用 → 已经回退到本机副本”的状态。
    nativeAudio.setAttribute('src', 'blob:mock/99')
    await flush()

    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const removeButton = [...document.querySelectorAll('.local-library-list button')]
      .find((button) => (button.getAttribute('aria-label') || '').includes('霓虹海'))
    expect(removeButton).toBeTruthy()

    const playCallsBefore = nativeAudio.__playCalls || 0
    removeButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(deletedPaths).toEqual(['/audio/1.wav'])
    // 关键回归点：blob 被 revoke 之后，音源必须换成在线地址并继续播放。
    expect(nativeAudio.getAttribute('src')).toBe('/audio/1.wav')
    expect(nativeAudio.__playCalls || 0).toBeGreaterThan(playCallsBefore)
    expect(store.playing).toBe(true)
  })

  it('删除的不是当前曲目副本时不动正在播放的音源', async () => {
    const store = await mountPlayer()
    store.playAll([song(2, '云端信使')], 2)
    await flush()

    const [nativeAudio] = document.querySelectorAll('audio')
    nativeAudio.setAttribute('src', '/audio/2.wav')
    const playCallsBefore = nativeAudio.__playCalls || 0

    host.querySelector('button[aria-label="播放队列"]').click()
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    const removeButton = [...document.querySelectorAll('.local-library-list button')]
      .find((button) => (button.getAttribute('aria-label') || '').includes('霓虹海'))
    expect(removeButton).toBeTruthy()
    removeButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flush()

    expect(deletedPaths).toEqual(['/audio/1.wav'])
    expect(nativeAudio.getAttribute('src')).toBe('/audio/2.wav')
    expect(nativeAudio.__playCalls || 0).toBe(playCallsBefore)
  })
})

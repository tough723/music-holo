import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_DOWNLOAD_CONCURRENCY,
  DEFAULT_FILENAME_TEMPLATE,
  DOWNLOAD_STATES,
  buildDownloadFileName,
  createDownloadEngine,
  createWebDownloadWriter
} from '@/utils/downloadCenter'
import { desktopSourceBridge } from '@/utils/desktopSource'
import { triggerDownload } from '@/utils/download'

const SETTINGS_KEY = 'mh_download_center_v1'
const MAX_PERSISTED_TASKS = 60

function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function persistSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* 隐私模式下忽略持久化失败 */ }
}

/** 桌面端写盘：把任务交给主进程流式落盘，进度通过事件回传。 */
function createDesktopWriter(bridge) {
  const download = bridge?.download
  if (!download?.start) return null
  return async function writeDesktop(task, { signal, offset, onProgress }) {
    const stop = typeof download.onEvent === 'function'
      ? download.onEvent((event) => {
        if (event?.id !== task.id) return
        if (event.type === 'progress') onProgress?.({ receivedBytes: event.receivedBytes, totalBytes: event.totalBytes })
      })
      : () => {}
    if (signal?.aborted) {
      stop()
      throw new Error('已取消')
    }
    const abort = () => download.cancel(task.id).catch(() => {})
    signal?.addEventListener('abort', abort, { once: true })
    try {
      return await download.start({
        id: task.id,
        url: task.url,
        dir: task.directory || '',
        fileName: task.fileName,
        offset: offset || 0
      })
    } finally {
      signal?.removeEventListener('abort', abort)
      stop()
    }
  }
}

export const useDownloadStore = defineStore('downloads', () => {
  const saved = readSettings()
  const concurrency = ref(Math.max(1, Number(saved.concurrency) || DEFAULT_DOWNLOAD_CONCURRENCY))
  const template = ref(String(saved.template || DEFAULT_FILENAME_TEMPLATE))
  const directory = ref(String(saved.directory || ''))
  const tasks = ref([])
  const engine = ref(null)
  const statusMessage = ref('')

  const bridge = desktopSourceBridge()
  const isDesktop = Boolean(bridge?.download?.start)

  function makeEngine() {
    const writer = isDesktop
      ? createDesktopWriter(bridge)
      : createWebDownloadWriter({
        // 网页端只能另存为浏览器下载；桌面端由主进程写盘。
        saveBlob: (task, blob) => { triggerDownload(blob, task.fileName) }
      })
    return createDownloadEngine({
      writer,
      concurrency: concurrency.value,
      onChange: () => { tasks.value = engine.value ? engine.value.list() : [] }
    })
  }

  function ensureEngine() {
    if (!engine.value) engine.value = makeEngine()
    return engine.value
  }

  function sync() {
    tasks.value = engine.value ? engine.value.list() : []
    persistSettings({ concurrency: concurrency.value, template: template.value, directory: directory.value })
  }

  const stats = computed(() => {
    const result = { queued: 0, downloading: 0, paused: 0, completed: 0, failed: 0, canceled: 0, total: 0, receivedBytes: 0, speed: 0 }
    for (const task of tasks.value) {
      result[task.state] = (result[task.state] || 0) + 1
      result.total += 1
      result.receivedBytes += task.receivedBytes || 0
      if (task.state === DOWNLOAD_STATES.DOWNLOADING) result.speed += task.speed || 0
    }
    return result
  })

  const activeCount = computed(() => stats.value.downloading + stats.value.queued)

  async function pickDirectory() {
    if (!isDesktop) {
      statusMessage.value = '网页版由浏览器决定保存位置；使用桌面客户端可指定下载目录。'
      return ''
    }
    const picked = await bridge.download.pickDirectory()
    if (picked) {
      directory.value = picked
      sync()
    }
    return picked || ''
  }

  /**
   * 入队下载。song 需带 audioUrl（或显式 url）；桌面端会写入 directory，
   * 网页端通过浏览器另存为保存。
   */
  function enqueue(entries) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean)
    if (!list.length) return []
    if (isDesktop && !directory.value) {
      statusMessage.value = '请先在下载中心选择保存目录'
      return []
    }
    const normalized = list.map((entry) => {
      const url = String(entry.url || entry.song?.audioUrl || '').trim()
      return {
        ...entry,
        url,
        directory: directory.value,
        template: template.value,
        extension: entry.extension || (String(url).includes('.flac') ? 'flac' : 'mp3'),
        fileName: entry.fileName || buildDownloadFileName(template.value, { ...entry, song: entry.song || entry }, tasks.value.length + 1)
      }
    }).filter((entry) => entry.url)
    if (!normalized.length) {
      statusMessage.value = '这些歌曲还没有可下载的音频地址'
      return []
    }
    const created = ensureEngine().enqueue(normalized)
    sync()
    statusMessage.value = `已加入 ${created.length} 个下载任务`
    return created
  }

  const control = (method, id) => {
    const result = ensureEngine()[method]?.(id)
    sync()
    return Boolean(result)
  }

  const pause = (id) => control('pause', id)
  const resume = (id) => control('resume', id)
  const cancel = (id) => control('cancel', id)
  const retry = (id) => control('retry', id)
  const remove = (id) => control('remove', id)

  function clearFinished() {
    ensureEngine().clearFinished()
    sync()
  }

  function setConcurrency(value) {
    concurrency.value = ensureEngine().setConcurrency(value)
    sync()
    return concurrency.value
  }

  function setTemplate(value) {
    template.value = String(value || DEFAULT_FILENAME_TEMPLATE).slice(0, 120)
    sync()
    return template.value
  }

  function setDirectory(value) {
    directory.value = String(value || '').slice(0, 400)
    sync()
    return directory.value
  }

  function destroy() {
    engine.value?.destroy()
    engine.value = null
  }

  return {
    tasks,
    stats,
    activeCount,
    concurrency,
    template,
    directory,
    statusMessage,
    isDesktop,
    enqueue,
    pause,
    resume,
    cancel,
    retry,
    remove,
    clearFinished,
    setConcurrency,
    setTemplate,
    setDirectory,
    pickDirectory,
    destroy
  }
})

export { MAX_PERSISTED_TASKS }

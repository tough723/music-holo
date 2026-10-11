// 下载中心：任务队列、并发控制、进度与速度统计、失败重试、暂停/继续、命名模板。
//
// 设计要点：
// - 引擎不关心“怎么把字节写到磁盘”，写盘由注入的 writer 决定（网页端 Blob 另存、
//   桌面端经受控 IPC 流式落盘），因此两端共用同一套队列语义与测试。
// - 所有下载来源必须是已解析出的媒体地址，URL 校验沿用音源/曲库的安全规则：
//   公网 HTTP(S)、无凭据、不跟随重定向（由调用方或桌面桥保证）。
// - 不做任何解密、去 DRM 或绕过限速的行为；只下载调用方本来就能播放的地址。

export const DOWNLOAD_STATES = Object.freeze({
  QUEUED: 'queued',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled'
})

export const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
export const DEFAULT_DOWNLOAD_CONCURRENCY = 2
export const MAX_DOWNLOAD_CONCURRENCY = 4
export const DEFAULT_FILENAME_TEMPLATE = '{artist} - {title}'
export const MAX_DOWNLOAD_ATTEMPTS = 3

const ILLEGAL_FILENAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g

/** 生成跨平台安全的文件名（不含扩展名）。 */
export function sanitizeFileNamePart(value, fallback = 'unknown') {
  const text = String(value ?? '')
    .replace(ILLEGAL_FILENAME, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80)
  return text || fallback
}

/**
 * 按模板生成文件名。可用占位符：
 * {title} {artist} {album} {quality} {platform} {index} {year}
 */
export function buildDownloadFileName(template, task = {}, index = 1) {
  const song = task.song && typeof task.song === 'object' ? task.song : {}
  const ext = String(task.extension || 'mp3').replace(/[^\w-]/g, '').slice(0, 8) || 'mp3'
  const values = {
    title: sanitizeFileNamePart(song.title || song.name, '未知曲目'),
    artist: sanitizeFileNamePart(song.singerName || song.singer || song.artist, '未知歌手'),
    album: sanitizeFileNamePart(song.album || song.albumName, '未知专辑'),
    quality: sanitizeFileNamePart(task.quality || '', '默认音质'),
    platform: sanitizeFileNamePart(task.sourcePlatform || task.platform || '', 'music-holo'),
    index: String(index).padStart(2, '0'),
    year: String(new Date().getFullYear())
  }
  const raw = String(template || DEFAULT_FILENAME_TEMPLATE)
  const filled = raw.replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? values[key] : match))
  return `${sanitizeFileNamePart(filled, 'music-holo-track')}.${ext}`
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `dl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @param {object} options
 * @param {(task, context) => Promise<void>} options.writer 真正写盘的通道
 * @param {number} [options.concurrency]
 * @param () => void [options.onChange] 任务状态变化时通知宿主（用于刷新界面）
 * @param () => number [options.now]
 */
export function createDownloadEngine({
  writer,
  concurrency = DEFAULT_DOWNLOAD_CONCURRENCY,
  onChange = () => {},
  now = () => Date.now()
} = {}) {
  const tasks = []
  const controllers = new Map()
  let limit = Math.max(1, Math.min(MAX_DOWNLOAD_CONCURRENCY, Number(concurrency) || DEFAULT_DOWNLOAD_CONCURRENCY))
  let active = 0
  let destroyed = false
  let sequence = 0

  const notify = () => {
    try { onChange() } catch { /* 通知失败不影响下载 */ }
  }

  const find = (id) => tasks.find((task) => task.id === id) || null

  function pump() {
    if (destroyed) return
    while (active < limit) {
      const next = tasks.find((task) => task.state === DOWNLOAD_STATES.QUEUED)
      if (!next) break
      runTask(next)
    }
  }

  async function runTask(task) {
    active += 1
    task.attempts += 1
    task.state = DOWNLOAD_STATES.DOWNLOADING
    task.startedAt = now()
    task.error = ''
    const controller = new AbortController()
    controllers.set(task.id, controller)
    let bytesAtStart = task.receivedBytes || 0
    let lastTick = now()
    let lastBytes = bytesAtStart
    notify()
    try {
      await writer(task, {
        signal: controller.signal,
        offset: bytesAtStart,
        onProgress: ({ receivedBytes, totalBytes }) => {
          const timestamp = now()
          const elapsed = (timestamp - lastTick) / 1000
          if (elapsed >= 0.4) {
            task.speed = Math.max(0, ((receivedBytes - lastBytes) / elapsed))
            task.etaSeconds = task.speed > 0 && totalBytes > receivedBytes ? Math.ceil((totalBytes - receivedBytes) / task.speed) : 0
            lastTick = timestamp
            lastBytes = receivedBytes
          }
          task.receivedBytes = Math.max(0, Number(receivedBytes) || 0)
          if (Number.isFinite(Number(totalBytes)) && Number(totalBytes) > 0) task.totalBytes = Number(totalBytes)
          if (task.totalBytes > 0) task.progress = Math.min(100, (task.receivedBytes / task.totalBytes) * 100)
          notify()
        }
      })
      task.state = DOWNLOAD_STATES.COMPLETED
      task.progress = 100
      task.completedAt = now()
      task.speed = 0
      task.etaSeconds = 0
    } catch (error) {
      const canceled = controller.signal.aborted || task.state === DOWNLOAD_STATES.CANCELED
      if (canceled) {
        task.state = DOWNLOAD_STATES.CANCELED
      } else if (task.attempts < MAX_DOWNLOAD_ATTEMPTS) {
        // 指数退避后重新排队；已下载的字节作为断点进度保留（writer 支持时续传）。
        task.state = DOWNLOAD_STATES.QUEUED
        task.error = String(error?.message || error || '下载失败')
        const delay = Math.min(8000, 500 * (2 ** (task.attempts - 1)))
        setTimeout(() => { if (!destroyed && task.state === DOWNLOAD_STATES.QUEUED) pump() }, delay)
      } else {
        task.state = DOWNLOAD_STATES.FAILED
        task.error = String(error?.message || error || '下载失败')
      }
    } finally {
      controllers.delete(task.id)
      active = Math.max(0, active - 1)
      notify()
      pump()
    }
  }

  return {
    list: () => tasks.map((task) => ({ ...task })),
    get: (id) => {
      const task = find(id)
      return task ? { ...task } : null
    },
    get concurrency() { return limit },
    setConcurrency(value) {
      limit = Math.max(1, Math.min(MAX_DOWNLOAD_CONCURRENCY, Number(value) || DEFAULT_DOWNLOAD_CONCURRENCY))
      notify()
      pump()
      return limit
    },
    enqueue(entries) {
      const list = Array.isArray(entries) ? entries : [entries]
      const created = []
      for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue
        const url = String(entry.url || '').trim()
        if (!url) continue
        const task = {
          id: createId(),
          url,
          song: entry.song && typeof entry.song === 'object' ? { ...entry.song } : {},
          quality: String(entry.quality || ''),
          sourcePlatform: String(entry.sourcePlatform || entry.platform || ''),
          sourceName: String(entry.sourceName || ''),
          extension: String(entry.extension || 'mp3'),
          fileName: String(entry.fileName || buildDownloadFileName(entry.template || DEFAULT_FILENAME_TEMPLATE, entry, sequence + 1)),
          state: DOWNLOAD_STATES.QUEUED,
          attempts: 0,
          receivedBytes: 0,
          totalBytes: Number(entry.totalBytes) || 0,
          progress: 0,
          speed: 0,
          etaSeconds: 0,
          error: '',
          createdAt: now(),
          startedAt: 0,
          completedAt: 0,
          order: ++sequence
        }
        tasks.push(task)
        created.push({ ...task })
      }
      notify()
      pump()
      return created
    },
    pause(id) {
      const task = find(id)
      if (!task) return false
      if (task.state === DOWNLOAD_STATES.DOWNLOADING) {
        controllers.get(id)?.abort(new Error('已暂停'))
        task.state = DOWNLOAD_STATES.PAUSED
      } else if (task.state === DOWNLOAD_STATES.QUEUED) {
        task.state = DOWNLOAD_STATES.PAUSED
      } else return false
      notify()
      pump()
      return true
    },
    resume(id) {
      const task = find(id)
      if (!task || (task.state !== DOWNLOAD_STATES.PAUSED && task.state !== DOWNLOAD_STATES.FAILED)) return false
      task.attempts = 0
      task.error = ''
      task.state = DOWNLOAD_STATES.QUEUED
      notify()
      pump()
      return true
    },
    cancel(id) {
      const task = find(id)
      if (!task) return false
      if ([DOWNLOAD_STATES.COMPLETED, DOWNLOAD_STATES.CANCELED].includes(task.state)) return false
      task.state = DOWNLOAD_STATES.CANCELED
      controllers.get(id)?.abort(new Error('已取消'))
      notify()
      return true
    },
    retry(id) {
      const task = find(id)
      if (!task || (task.state !== DOWNLOAD_STATES.FAILED && task.state !== DOWNLOAD_STATES.CANCELED)) return false
      task.attempts = 0
      task.error = ''
      task.state = DOWNLOAD_STATES.QUEUED
      notify()
      pump()
      return true
    },
    remove(id) {
      const index = tasks.findIndex((task) => task.id === id)
      if (index < 0) return false
      const [task] = tasks.splice(index, 1)
      if (task.state === DOWNLOAD_STATES.DOWNLOADING) {
        controllers.get(id)?.abort(new Error('已移除'))
        active = Math.max(0, active - 1)
      }
      notify()
      pump()
      return true
    },
    clearFinished() {
      for (let index = tasks.length - 1; index >= 0; index -= 1) {
        const state = tasks[index].state
        if ([DOWNLOAD_STATES.COMPLETED, DOWNLOAD_STATES.CANCELED, DOWNLOAD_STATES.FAILED].includes(state)) tasks.splice(index, 1)
      }
      notify()
    },
    stats() {
      const byState = { queued: 0, downloading: 0, paused: 0, completed: 0, failed: 0, canceled: 0 }
      let receivedBytes = 0
      let speed = 0
      for (const task of tasks) {
        byState[task.state] = (byState[task.state] || 0) + 1
        receivedBytes += task.receivedBytes || 0
        if (task.state === DOWNLOAD_STATES.DOWNLOADING) speed += task.speed || 0
      }
      return { ...byState, total: tasks.length, active: byState.downloading, receivedBytes, speed }
    },
    destroy() {
      destroyed = true
      for (const controller of controllers.values()) controller.abort(new Error('下载中心已关闭'))
      controllers.clear()
    }
  }
}

/** 网页端写盘：流式读取到 Blob，再交给浏览器另存（受同源与内存上限约束）。 */
export function createWebDownloadWriter({ fetchImpl, saveBlob, maxBytes = MAX_DOWNLOAD_BYTES } = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
  return async function writeWeb(task, { signal, onProgress }) {
    const response = await doFetch(task.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal
    })
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    const totalBytes = Number(response.headers.get('content-length')) || task.totalBytes || 0
    const chunks = []
    let receivedBytes = 0
    if (response.body?.getReader) {
      const reader = response.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          receivedBytes += value.byteLength
          if (receivedBytes > maxBytes) {
            await reader.cancel('too large')
            throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB 上限，已中止`)
          }
          chunks.push(value)
          onProgress?.({ receivedBytes, totalBytes })
        }
      } finally {
        reader.releaseLock?.()
      }
    } else {
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > maxBytes) throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB 上限，已中止`)
      receivedBytes = buffer.byteLength
      chunks.push(new Uint8Array(buffer))
      onProgress?.({ receivedBytes, totalBytes })
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' })
    await saveBlob?.(task, blob)
    onProgress?.({ receivedBytes, totalBytes: totalBytes || receivedBytes })
  }
}

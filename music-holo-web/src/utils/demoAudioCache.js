/**
 * 只缓存 Music Holo 自有演示音频。拒绝外链、Blob、自定义源和上传目录。
 */

const DB_NAME = 'music-holo-demo-audio'
const STORE = 'clips'
const DB_VERSION = 1
const MAX_BYTES = 8 * 1024 * 1024
const DEMO_AUDIO_PATH = /^\/audio\/[^/]+\.(?:wav|mp3|ogg|oga|flac|m4a|aac|opus)$/i

const objectUrls = new Map()

export function isOwnDemoAudioUrl(url, baseHref = 'http://127.0.0.1/') {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return false
  try {
    const parsed = new URL(url, baseHref)
    const base = new URL(baseHref)
    if (parsed.origin !== base.origin) return false
    if (parsed.username || parsed.password) return false
    return DEMO_AUDIO_PATH.test(parsed.pathname)
  } catch {
    return false
  }
}

export function demoAudioPath(url, baseHref = 'http://127.0.0.1/') {
  if (!isOwnDemoAudioUrl(url, baseHref)) return ''
  return new URL(url, baseHref).pathname
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'path' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开演示音频缓存'))
  })
}

function withStore(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    Promise.resolve(run(store)).then((value) => {
      result = value
    }).catch(reject)
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('演示音频缓存写入失败'))
    }
  }))
}

export function listCachedDemoAudio() {
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve((request.result || []).map((item) => ({
      path: item.path,
      title: item.title || item.path,
      songId: item.songId ?? null,
      bytes: item.bytes || item.blob?.size || 0,
      savedAt: item.savedAt || 0
    })).sort((a, b) => b.savedAt - a.savedAt))
    request.onerror = () => reject(request.error || new Error('无法读取演示音频缓存'))
  }))
}

export async function hasCachedDemoAudio(url, baseHref) {
  const path = demoAudioPath(url, baseHref)
  if (!path) return false
  const row = await withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(path)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  }))
  return Boolean(row?.blob)
}

export async function objectUrlForCachedDemo(url, baseHref) {
  const path = demoAudioPath(url, baseHref)
  if (!path) return ''
  if (objectUrls.has(path)) return objectUrls.get(path)
  const row = await withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.get(path)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  }))
  if (!row?.blob) return ''
  const objectUrl = URL.createObjectURL(row.blob)
  objectUrls.set(path, objectUrl)
  return objectUrl
}

export async function saveOwnDemoAudio(song, baseHref, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const path = demoAudioPath(song?.audioUrl, baseHref)
  if (!path) throw new Error('只能保存本站演示音频')
  const response = await fetchImpl(path, { credentials: 'omit', cache: 'no-store' })
  if (!response?.ok) throw new Error('演示音频下载失败')
  const type = String(response.headers?.get?.('content-type') || '')
  if (type.includes('text/html')) throw new Error('返回的不是音频')
  if (type && !type.startsWith('audio/') && !type.startsWith('application/octet-stream')) {
    throw new Error('返回的不是音频')
  }
  const blob = await response.blob()
  if (!blob || blob.size <= 44 || blob.size > MAX_BYTES) throw new Error('演示音频大小不适合离线保存')
  const record = {
    path,
    title: song.title || path,
    songId: song.id ?? null,
    bytes: blob.size,
    blob,
    savedAt: Date.now()
  }
  await withStore('readwrite', (store) => {
    store.put(record)
  })
  revokeObjectUrl(path)
  return { path, title: record.title, songId: record.songId, bytes: record.bytes, savedAt: record.savedAt }
}

export async function deleteCachedDemoAudio(path) {
  if (!path) return
  await withStore('readwrite', (store) => {
    store.delete(path)
  })
  revokeObjectUrl(path)
}

function revokeObjectUrl(path) {
  const url = objectUrls.get(path)
  if (!url) return
  objectUrls.delete(path)
  URL.revokeObjectURL(url)
}

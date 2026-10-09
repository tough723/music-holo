/**
 * 本机音乐句柄库。只在用户授权后把 FileSystemFileHandle 放进 IndexedDB，
 * 不上传、不扫描目录，也不把临时 Blob 地址写进播放队列持久化。
 */

const DB_NAME = 'music-holo-local-library'
const STORE = 'handles'
const DB_VERSION = 1

export function supportsPersistentFileHandles() {
  return typeof globalThis.showOpenFilePicker === 'function' && typeof globalThis.indexedDB !== 'undefined'
}

export function createHandleRecordId() {
  return globalThis.crypto?.randomUUID?.() || `handle-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function queryReadPermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'unknown'
  try {
    return await handle.queryPermission({ mode: 'read' })
  } catch {
    return 'unknown'
  }
}

export async function requestReadPermission(handle) {
  if (!handle || typeof handle.requestPermission !== 'function') return 'unknown'
  try {
    return await handle.requestPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地音乐库'))
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
      reject(tx.error || new Error('本地音乐库写入失败'))
    }
  }))
}

export async function rememberHandle(handle) {
  if (!handle || typeof handle.getFile !== 'function') {
    throw new Error('这个浏览器不能记住文件句柄')
  }
  const name = handle.name || '本地音乐'
  const record = { id: createHandleRecordId(), name, handle, addedAt: Date.now() }
  await withStore('readwrite', (store) => {
    store.put(record)
  })
  return { id: record.id, name, addedAt: record.addedAt }
}

export function listRememberedHandles() {
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve((request.result || []).map((item) => ({
      id: item.id,
      name: item.name || item.handle?.name || '本地音乐',
      addedAt: item.addedAt || 0,
      handle: item.handle
    })))
    request.onerror = () => reject(request.error || new Error('无法读取本地音乐库'))
  }))
}

export function forgetRememberedHandle(id) {
  return withStore('readwrite', (store) => {
    store.delete(id)
  })
}

export async function filesFromGrantedHandles(records, { requestIfNeeded = false } = {}) {
  const files = []
  let blocked = 0
  for (const record of records || []) {
    const handle = record?.handle
    if (!handle || typeof handle.getFile !== 'function') {
      blocked += 1
      continue
    }
    let permission = await queryReadPermission(handle)
    if (permission !== 'granted' && requestIfNeeded) permission = await requestReadPermission(handle)
    if (permission !== 'granted') {
      blocked += 1
      continue
    }
    try {
      const file = await handle.getFile()
      files.push({ file, handleId: record.id, name: record.name || file.name })
    } catch {
      blocked += 1
    }
  }
  return { files, blocked }
}

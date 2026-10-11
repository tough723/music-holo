// LX 风格的数据同步：客户端加密 + 快照密钥（snapshot key）。
//
// 与 LX Music 同步服务一致的模型：
//   · 服务端只存放「按 key 索引的加密快照」，永远拿不到明文，也拿不到加密口令；
//   · 客户端用 PBKDF2-SHA256 从口令派生 AES-GCM 密钥后再上传/下载；
//   · 冲突由客户端决定：合并（并集）、以本地覆盖远程、以远程覆盖本地。
//
// 需要说明的边界：LX 桌面端与官方 lx-music-sync-server 之间走的是 WebSocket 私有协议，
// 官方没有公开该消息格式。这里提供的是同一安全模型的 REST 快照实现，
// 可与自建的兼容快照服务对接；**未与官方服务端做过互通测试**，界面会如实标注。
//
// 安全约束：
//   · 服务器地址必须是用户自己填写的 HTTPS 地址（网页版强制 HTTPS；桌面端可显式允许本机 HTTP）；
//   · 自定义音源脚本全文默认不上传（脚本里可能含第三方接口地址与作者信息），需用户显式开启；
//   · 不上传任何登录凭据、Cookie 或令牌；快照里不含音源脚本的密钥（本项目本就不保存密钥）。

const PBKDF2_ITERATIONS = 200_000
const SNAPSHOT_VERSION = 1

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(String(value || ''))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function randomBytes(size) {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

/** 生成一个新的快照密钥：同时用作服务端索引与 PBKDF2 盐的一部分。 */
export function createSnapshotKey() {
  return toBase64(randomBytes(24)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 校验同步服务地址：网页版强制 HTTPS，桌面端允许显式配置的本机 HTTP。 */
export function normalizeSyncBaseUrl(value, { allowInsecure = false } = {}) {
  const raw = String(value ?? '').trim().replace(/\/+$/, '')
  if (!raw) throw new Error('请填写同步服务地址')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('同步服务地址不是有效 URL')
  }
  const isLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.protocol === 'http:' && !(allowInsecure && isLocal)) {
    throw new Error(isLocal ? '本机 HTTP 同步服务需要显式开启「允许本机 HTTP」' : '同步服务必须使用 HTTPS')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('同步服务地址只支持 HTTP(S)')
  return url.href.replace(/\/$/, '')
}

async function deriveAesKey(password, salt) {
  const material = await globalThis.crypto.subtle.importKey('raw', encoder.encode(String(password || '')), 'PBKDF2', false, ['deriveKey'])
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** 加密快照：返回可安全存放到任何服务端的密文结构。 */
export async function encryptSnapshot(payload, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveAesKey(password, salt)
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload ?? {})))
  return {
    v: SNAPSHOT_VERSION,
    alg: 'PBKDF2-SHA256/AES-GCM',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher))
  }
}

export async function decryptSnapshot(blob, password) {
  if (!blob || typeof blob !== 'object') throw new Error('快照格式无效')
  if (blob.alg && blob.alg !== 'PBKDF2-SHA256/AES-GCM') throw new Error(`不支持的快照算法：${blob.alg}`)
  try {
    const key = await deriveAesKey(password, fromBase64(blob.salt))
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv) },
      key,
      fromBase64(blob.data)
    )
    return JSON.parse(decoder.decode(new Uint8Array(plain)))
  } catch {
    // 口令错误、快照损坏或被篡改都会走到这里，统一提示，不泄漏细节。
    throw new Error('快照解密失败：加密口令不正确或快照已损坏')
  }
}

/**
 * 收集要同步的本地数据。
 * @param {object} options.includeSourceScripts 是否包含自定义音源脚本全文（默认否）
 */
export function buildSnapshot({ favorites = [], dislikes = [], queue = [], preferences = {}, customSources = [], includeSourceScripts = false } = {}) {
  return {
    kind: 'music-holo-snapshot',
    version: SNAPSHOT_VERSION,
    updatedAt: new Date().toISOString(),
    favorites: Array.isArray(favorites) ? favorites.slice(0, 5000) : [],
    dislikes: Array.isArray(dislikes) ? dislikes.slice(0, 2000) : [],
    // 只同步曲库歌曲：本地文件与临时自定义源地址只在当前设备有效。
    queue: (Array.isArray(queue) ? queue : []).filter((song) => song && !song.isLocal && !song.isCustomSource).slice(0, 2000)
      .map((song) => ({ id: song.id, title: song.title, singerName: song.singerName, album: song.album, duration: song.duration })),
    preferences: preferences && typeof preferences === 'object' ? { ...preferences } : {},
    customSources: (Array.isArray(customSources) ? customSources : []).slice(0, 200).map((source) => ({
      id: source.id,
      name: source.name,
      description: source.description || '',
      version: source.version || '',
      author: source.author || '',
      homepage: source.homepage || '',
      fileName: source.fileName || '',
      // 脚本全文只在用户明确勾选时才上传。
      ...(includeSourceScripts ? { script: source.script || '' } : {})
    }))
  }
}

function uniqueBy(list, keyOf) {
  const seen = new Set()
  const result = []
  for (const item of list) {
    const key = keyOf(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function mergeByTime(local = [], remote = []) {
  const byId = new Map()
  for (const item of [...local, ...remote]) {
    const id = String(item?.id ?? '')
    if (!id) continue
    const previous = byId.get(id)
    if (!previous || Number(item?.updatedAt || 0) >= Number(previous?.updatedAt || 0)) byId.set(id, item)
  }
  return [...byId.values()]
}

/**
 * 合并本地与远程快照。
 * @param {'merge'|'local'|'remote'} strategy
 */
export function mergeSnapshots(local, remote, strategy = 'merge') {
  if (strategy === 'local') return { ...local, updatedAt: new Date().toISOString() }
  if (strategy === 'remote') return { ...(remote || {}), updatedAt: new Date().toISOString() }
  const a = local && typeof local === 'object' ? local : {}
  const b = remote && typeof remote === 'object' ? remote : {}
  return {
    kind: 'music-holo-snapshot',
    version: SNAPSHOT_VERSION,
    updatedAt: new Date().toISOString(),
    // 合并取并集：收藏/不喜欢/队列按 id 去重，偏好以本地为准（远程缺失时补本地）。
    favorites: uniqueBy([...(Array.isArray(a.favorites) ? a.favorites : []), ...(Array.isArray(b.favorites) ? b.favorites : [])], (item) => String(item?.id ?? '')),
    dislikes: mergeByTime(Array.isArray(a.dislikes) ? a.dislikes : [], Array.isArray(b.dislikes) ? b.dislikes : []),
    queue: uniqueBy([...(Array.isArray(a.queue) ? a.queue : []), ...(Array.isArray(b.queue) ? b.queue : [])], (item) => String(item?.id ?? '')),
    preferences: { ...(b.preferences || {}), ...(a.preferences || {}) },
    customSources: uniqueBy([...(Array.isArray(a.customSources) ? a.customSources : []), ...(Array.isArray(b.customSources) ? b.customSources : [])], (item) => String(item?.id ?? ''))
  }
}

/**
 * 同步客户端。所有请求都只打到用户填写的服务地址，且不携带 Music Holo 的登录态。
 * @returns {{ fetchSnapshot: Function, uploadSnapshot: Function, sync: Function }}
 */
export function createSyncClient({ baseUrl, key, password, token = '', allowInsecure = false, fetchImpl }) {
  const base = normalizeSyncBaseUrl(baseUrl, { allowInsecure })
  const snapshotKey = String(key || '').trim()
  if (!snapshotKey) throw new Error('请先设置快照密钥')
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }

  async function request(path, options = {}) {
    const response = await doFetch(`${base}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      credentials: 'omit',
      mode: 'cors',
      redirect: 'error',
      cache: 'no-store'
    })
    if (!response.ok) throw new Error(`同步服务返回 HTTP ${response.status}`)
    const text = await response.text()
    if (!text.trim()) return {}
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('同步服务返回的不是 JSON')
    }
  }

  return {
    get baseUrl() { return base },
    get key() { return snapshotKey },
    async fetchSnapshot() {
      const remote = await request(`/snapshot?key=${encodeURIComponent(snapshotKey)}`, { method: 'GET' })
      if (!remote?.data) return { snapshot: null, updatedAt: remote?.time || remote?.updatedAt || '' }
      return { snapshot: await decryptSnapshot(remote.data, password), updatedAt: remote?.time || remote?.updatedAt || '' }
    },
    async uploadSnapshot(snapshot) {
      const encrypted = await encryptSnapshot(snapshot, password)
      const result = await request('/snapshot', { method: 'POST', body: JSON.stringify({ key: snapshotKey, data: encrypted }) })
      return { time: result?.time || result?.updatedAt || new Date().toISOString() }
    },
    /**
     * 一次完整同步：拉取远程 → 合并 → 上传。
     * @returns {Promise<{ snapshot: object, remoteUpdatedAt: string, uploadedAt: string, remoteEmpty: boolean }>}
     */
    async sync(localSnapshot, { strategy = 'merge' } = {}) {
      const { snapshot: remoteSnapshot, updatedAt } = await this.fetchSnapshot()
      const merged = remoteSnapshot ? mergeSnapshots(localSnapshot, remoteSnapshot, strategy) : localSnapshot
      const uploaded = await this.uploadSnapshot(merged)
      return { snapshot: merged, remoteUpdatedAt: updatedAt, uploadedAt: uploaded.time, remoteEmpty: !remoteSnapshot }
    }
  }
}

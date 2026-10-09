import { parseSourceNetworkUrl, desktopSourceBridge } from './desktopSource'
import workerBootstrap from './customSourceWorker.js?raw'
import { MAX_CUSTOM_SOURCE_BYTES, parseCustomSourceUrl } from './customSources'

export const CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS = desktopSourceBridge() ? 60000 : 15000
export const CUSTOM_SOURCE_SESSION_TIMEOUT_MS = desktopSourceBridge() ? 600000 : 45000
export const CUSTOM_SOURCE_ACTION_TIMEOUT_MS = desktopSourceBridge() ? 90000 : 20000
export const MAX_CUSTOM_SOURCE_REQUEST_BYTES = 64 * 1024
export const MAX_CUSTOM_SOURCE_RESPONSE_BYTES = 512 * 1024
const MAX_CUSTOM_SOURCE_URL_LENGTH = 4096
const MAX_ACTIVE_SOURCE_REQUESTS = 4
const BLOCKED_HEADERS = new Set([
  'authorization', 'cookie', 'cookie2', 'host', 'origin', 'proxy-authorization',
  'referer', 'connection', 'content-length', 'transfer-encoding'
])

function cleanText(value, maxLength = 80) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
}

function normalizeStringList(value, maxItems = 16) {
  const entries = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value) : []
  return [...new Set(entries.map((entry) => cleanText(entry, 40)).filter(Boolean))].slice(0, maxItems)
}

export function normalizeLxSourceCapabilities(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('音源未提供有效的初始化信息')
  }
  const rawSources = payload.sources
  if (!rawSources || typeof rawSources !== 'object' || Array.isArray(rawSources)) {
    throw new Error('音源未声明 sources，无法确认兼容能力')
  }
  const entries = Object.entries(rawSources)
  if (entries.length === 0 || entries.length > 16) {
    throw new Error('音源声明的平台数量无效（需为 1–16 个）')
  }
  const sources = entries.map(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`平台「${cleanText(key, 40)}」的声明格式无效`)
    }
    const sourceKey = cleanText(key, 40)
    const name = cleanText(value.name || sourceKey, 80)
    if (!sourceKey || !name) throw new Error('音源平台缺少有效名称')
    return {
      key: sourceKey,
      name,
      type: cleanText(value.type || 'music', 32),
      actions: normalizeStringList(value.actions),
      qualities: normalizeStringList(value.qualitys || value.qualities)
    }
  })
  return { sources, initializedAt: new Date().toISOString() }
}

export function validateCustomSourceMediaUrl(value, { pageOrigin = globalThis.location?.origin } = {}) {
  const rawUrl = typeof value === 'string' ? value : value && typeof value === 'object' ? value.url : ''
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new Error('音源没有返回可播放的 HTTPS 音频地址')
  const url = parseSourceNetworkUrl(rawUrl.trim())
  url.hash = ''
  let currentOrigin = ''
  try { currentOrigin = pageOrigin ? new URL(pageOrigin).origin : '' } catch { /* Ignore unavailable page origins in non-browser tests. */ }
  if (currentOrigin && url.origin === currentOrigin) {
    throw new Error('自定义媒体地址不能与 Music Holo 页面同源，以避免请求携带站点 Cookie 或登录态')
  }
  return { href: url.href, origin: url.origin }
}

/** Build only the public, non-secret fields passed to a compatible resolver. */
export function buildCustomSourceMusicInfo(song) {
  if (!song || typeof song !== 'object' || Array.isArray(song)) {
    throw new Error('请选择有效的曲库歌曲')
  }
  const title = cleanText(song.title || song.name, 180)
  if (!title) throw new Error('歌曲缺少有效标题')
  const singerName = cleanText(song.singerName || song.singer || song.artist, 180)
  const album = cleanText(song.album || song.albumName, 180)
  const duration = Number(song.duration)
  const songId = cleanText(song.id, 128)
  return {
    ...(songId ? { musicHoloId: songId, id: songId } : {}),
    title,
    name: title,
    ...(singerName ? { singerName, singer: singerName } : {}),
    ...(album ? { album } : {}),
    ...(Number.isFinite(duration) && duration >= 0 && duration <= 3600 ? { duration } : {})
  }
}

const MAX_CUSTOM_SOURCE_MUSIC_INFO_BYTES = 64 * 1024
const BLOCKED_MUSIC_INFO_KEYS = /(?:authorization|cookie|password|passwd|secret|token|csrf|credential|session)/i

export function mergeCustomSourceMusicInfo(song, extraJson = '{}') {
  const base = buildCustomSourceMusicInfo(song)
  let extra = {}
  const text = String(extraJson ?? '').trim()
  if (text) {
    try { extra = JSON.parse(text) } catch { throw new Error('平台专属曲目字段不是有效 JSON') }
  }
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    throw new Error('平台专属曲目字段必须是 JSON 对象')
  }

  const assertSafeKeys = (value, depth = 0) => {
    if (depth > 8) throw new Error('平台专属曲目字段嵌套过深')
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (BLOCKED_MUSIC_INFO_KEYS.test(key)) throw new Error(`平台专属字段「${cleanText(key, 40)}」疑似凭据，不允许传给音源`)
      assertSafeKeys(child, depth + 1)
    }
  }
  assertSafeKeys(extra)

  let serialized
  try { serialized = JSON.stringify(extra) } catch { throw new Error('平台专属曲目字段无法序列化') }
  if (new TextEncoder().encode(serialized || '{}').byteLength > MAX_CUSTOM_SOURCE_MUSIC_INFO_BYTES) {
    throw new Error('平台专属曲目字段不能超过 64 KB')
  }

  const combined = { ...extra, ...base }
  if (new TextEncoder().encode(JSON.stringify(combined)).byteLength > MAX_CUSTOM_SOURCE_MUSIC_INFO_BYTES) {
    throw new Error('发送给音源的曲目信息不能超过 64 KB')
  }
  return combined
}

export function parseCustomSourceLyrics(value) {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object'
    ? (value.lyric || value.lrc || value.text || '') : ''
  if (Array.isArray(value)) {
    return value.map((line) => ({ time: Number(line?.time), text: cleanText(line?.text, 300) }))
      .filter((line) => Number.isFinite(line.time) && line.time >= 0 && line.text)
      .sort((left, right) => left.time - right.time).slice(0, 1000)
  }
  if (typeof raw !== 'string' || !raw.trim()) return []
  const lines = []
  const timestamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const normalizedLyrics = raw.slice(0, 256 * 1024)
    .replace(/\\+r?\\+n/g, '\n')
    .replace(/\\+n/g, '\n')
    .replace(/\\+r/g, '\n')
  for (const rawLine of normalizedLyrics.split(/\r?\n/)) {
    const line = rawLine.trim()
    const timestamps = []
    let textStart = 0
    let match
    timestamp.lastIndex = 0
    while ((match = timestamp.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0
      timestamps.push(minutes * 60 + seconds + fraction)
      textStart = timestamp.lastIndex
    }
    if (!timestamps.length) continue
    const text = cleanText(line.slice(textStart), 300)
    if (!text) continue
    for (const time of timestamps) lines.push({ time, text })
  }
  return lines.sort((left, right) => left.time - right.time).slice(0, 1000)
}

async function readResponseBody(response, maxBytes) {
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxBytes) throw new Error('音源接口响应超过 512 KB，已中止')
    return new TextDecoder().decode(buffer)
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel('response too large')
        throw new Error('音源接口响应超过 512 KB，已中止')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock?.()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

function normalizeRequestBody(options, headers, method) {
  if (method === 'GET' || method === 'HEAD') return undefined
  if (options.formData && typeof options.formData === 'object') {
    const formData = new FormData()
    for (const [key, value] of Object.entries(options.formData)) formData.append(key, String(value))
    headers.delete('content-type')
    return formData
  }
  if (options.form && typeof options.form === 'object') {
    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(options.form)) form.set(key, String(value))
    if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
    return form.toString()
  }
  const body = options.body
  if (body == null) return undefined
  if (typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body
  if (typeof body === 'object') {
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return JSON.stringify(body)
  }
  return String(body)
}

export async function performCustomSourceRequest(rawUrl, rawOptions = {}, { signal: externalSignal } = {}) {
  if (String(rawUrl || '').length > MAX_CUSTOM_SOURCE_URL_LENGTH) throw new Error('音源请求 URL 超过 4096 个字符')
  const url = parseCustomSourceUrl(rawUrl)
  url.hash = ''
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {}
  const method = String(options.method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'HEAD'].includes(method)) {
    throw new Error(`隔离检测仅允许 GET、POST、HEAD；已拦截 ${method}`)
  }

  const headers = new Headers()
  const inputHeaders = options.headers && typeof options.headers === 'object' ? Object.entries(options.headers) : []
  if (inputHeaders.length > 32) throw new Error('音源请求头超过 32 项')
  for (const [name, value] of inputHeaders) {
    const cleanName = String(name)
    const cleanValue = String(value ?? '')
    if (cleanName.length > 128 || cleanValue.length > 2048) throw new Error('音源请求头超过长度限制')
    const normalizedName = cleanName.toLowerCase()
    if (BLOCKED_HEADERS.has(normalizedName)) continue
    if (typeof value === 'string' || typeof value === 'number') headers.set(cleanName, cleanValue)
  }

  const requestBody = normalizeRequestBody(options, headers, method)
  const bodyBytes = typeof requestBody === 'string'
    ? new TextEncoder().encode(requestBody).byteLength
    : requestBody instanceof ArrayBuffer
      ? requestBody.byteLength
      : ArrayBuffer.isView(requestBody)
        ? requestBody.byteLength
        : options.formData
          ? new TextEncoder().encode(JSON.stringify(options.formData)).byteLength
          : 0
  if (bodyBytes > MAX_CUSTOM_SOURCE_REQUEST_BYTES) throw new Error('音源请求体超过 64 KB')

  const timeoutMs = Math.max(500, Math.min(15000, Number(options.timeout) || 10000))
  const controller = new AbortController()
  const abortFromOuter = () => controller.abort()
  if (externalSignal?.aborted) controller.abort()
  else externalSignal?.addEventListener('abort', abortFromOuter, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url.href, {
      method,
      headers,
      body: requestBody,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    })
    const body = await readResponseBody(response, MAX_CUSTOM_SOURCE_RESPONSE_BYTES)
    const responseHeaders = {}
    let headerBytes = 0
    for (const [name, value] of [...response.headers.entries()].slice(0, 64)) {
      headerBytes += name.length + value.length
      if (headerBytes > 8 * 1024) break
      responseHeaders[name] = value
    }
    return { statusCode: response.status, headers: responseHeaders, body }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(externalSignal?.aborted ? '音源请求已取消' : '音源接口请求超时')
    }
    if (error instanceof TypeError) {
      throw new Error('请求失败：目标站点可能不支持浏览器跨域访问（CORS），或网络不可达')
    }
    throw error
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromOuter)
  }
}

function createSandboxDocument() {
  const csp = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; media-src 'none'; style-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><script>
(() => {
  let token = '';
  let worker = null;
  const forward = (message) => parent.postMessage({ ...message, token }, '*');
  addEventListener('message', (event) => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    const message = event.data;
    if (!token && message.type === 'bootstrap' && typeof message.token === 'string') {
      token = message.token;
      try {
        const blob = new Blob([String(message.workerBootstrap || '')], { type: 'text/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        worker.addEventListener('message', (workerEvent) => forward(workerEvent.data || {}));
        worker.addEventListener('error', (workerError) => forward({ type: 'source-error', error: workerError.message || '隔离 Worker 执行失败' }));
        worker.postMessage({ type: 'initialize', script: String(message.script || ''), metadata: message.metadata || {}, env: message.env });
        forward({ type: 'sandbox-ready' });
      } catch (error) {
        forward({ type: 'source-error', error: String(error && error.message || error) });
      }
      return;
    }
    if (!token || message.token !== token) return;
    if (message.type === 'request-result' && worker) worker.postMessage(message.payload);
    if (message.type === 'dispatch' && worker) worker.postMessage(message.payload);
    if (message.type === 'terminate') {
      worker && worker.terminate();
      worker = null;
      forward({ type: 'sandbox-terminated' });
    }
  });
})();
</script></body></html>`
}

function createRunToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const values = new Uint32Array(4)
  globalThis.crypto?.getRandomValues?.(values)
  return Array.from(values, (value) => value.toString(16)).join('-') || `${Date.now()}-${Math.random()}`
}

export function createCustomSourceSession(source, {
  onRequest = performCustomSourceRequest,
  startupTimeoutMs = CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS,
  sessionTimeoutMs = CUSTOM_SOURCE_SESSION_TIMEOUT_MS,
  actionTimeoutMs = CUSTOM_SOURCE_ACTION_TIMEOUT_MS,
  signal
} = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.reject(new Error('音源隔离检测只能在浏览器页面中运行'))
  }
  if (!source || typeof source.script !== 'string' || !source.script.trim()) {
    return Promise.reject(new Error('音源脚本为空'))
  }
  if (new TextEncoder().encode(source.script).byteLength > MAX_CUSTOM_SOURCE_BYTES) {
    return Promise.reject(new Error(`音源脚本不能超过 ${Math.round(MAX_CUSTOM_SOURCE_BYTES / 1024)} KB`))
  }
  if (!document.body) return Promise.reject(new Error('页面尚未准备好，无法创建隔离环境'))
  if (signal?.aborted) return Promise.reject(new Error('隔离音源会话已取消'))

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    const token = createRunToken()
    const pendingActions = new Map()
    const pendingNetwork = new Map()
    let capabilities = null
    let initialized = false
    let destroyed = false
    let initSettled = false
    let requestSequence = 0
    let activeNetworkCount = 0
    const startupLimit = Math.max(1000, Math.min(desktopSourceBridge() ? 60000 : 30000, Number(startupTimeoutMs) || CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS))
    const sessionLimit = Math.max(1000, Math.min(desktopSourceBridge() ? 600000 : 60000, Number(sessionTimeoutMs) || CUSTOM_SOURCE_SESSION_TIMEOUT_MS))
    const actionLimit = Math.max(1000, Math.min(desktopSourceBridge() ? 120000 : 30000, Number(actionTimeoutMs) || CUSTOM_SOURCE_ACTION_TIMEOUT_MS))
    let startupTimer
    let sessionTimer

    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('title', '自定义音源隔离运行时')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none'
    iframe.srcdoc = createSandboxDocument()

    const removeFrame = () => {
      clearTimeout(startupTimer)
      clearTimeout(sessionTimer)
      window.removeEventListener('message', handleMessage)
      signal?.removeEventListener('abort', onExternalAbort)
      onRequest.dispose?.()
      for (const controller of pendingNetwork.values()) controller.abort()
      pendingNetwork.clear()
      iframe.remove()
    }
    const destroy = (reason = new Error('隔离音源会话已结束')) => {
      if (destroyed) return
      destroyed = true
      const error = reason instanceof Error ? reason : new Error(String(reason || '隔离音源会话已结束'))
      removeFrame()
      for (const pending of pendingActions.values()) {
        clearTimeout(pending.timer)
        pending.reject(error)
      }
      pendingActions.clear()
      if (!initSettled) {
        initSettled = true
        reject(error)
      }
    }
    const onExternalAbort = () => destroy(new Error('隔离音源会话已取消'))
    const replyToWorker = (requestId, result) => {
      if (destroyed || !iframe.contentWindow) return
      iframe.contentWindow.postMessage({
        type: 'request-result',
        token,
        payload: { type: 'request-result', requestId, ...result }
      }, '*')
    }
    const session = {
      get capabilities() { return capabilities },
      get isActive() { return initialized && !destroyed },
      request({ source: sourceKey, action, info = {} } = {}) {
        if (destroyed) return Promise.reject(new Error('隔离音源会话已结束'))
        if (!initialized || !capabilities) return Promise.reject(new Error('音源尚未初始化'))
        const platform = capabilities.sources.find((item) => item.key === sourceKey)
        if (!platform) return Promise.reject(new Error(`此脚本未声明「${cleanText(sourceKey, 40)}」平台`))
        if (!platform.actions.includes(action)) return Promise.reject(new Error(`「${platform.name}」未声明 ${cleanText(action, 40)} 能力`))
        if (pendingActions.size >= MAX_ACTIVE_SOURCE_REQUESTS) return Promise.reject(new Error('同时只能运行少量音源操作'))
        if (!info || typeof info !== 'object' || Array.isArray(info)) return Promise.reject(new Error('音源请求信息必须是 JSON 对象'))
        let serialized
        try { serialized = JSON.stringify(info) } catch { return Promise.reject(new Error('音源请求信息无法序列化')) }
        if (new TextEncoder().encode(serialized || '{}').byteLength > MAX_CUSTOM_SOURCE_REQUEST_BYTES) {
          return Promise.reject(new Error('音源请求信息超过 64 KB'))
        }
        const requestId = `host-action-${++requestSequence}`
        return new Promise((actionResolve, actionReject) => {
          const timer = setTimeout(() => destroy(new Error(`音源 ${action} 操作超过 ${Math.round(actionLimit / 1000)} 秒`)), actionLimit)
          pendingActions.set(requestId, { resolve: actionResolve, reject: actionReject, timer })
          iframe.contentWindow?.postMessage({
            type: 'dispatch',
            token,
            payload: {
              type: 'dispatch',
              eventName: 'request',
              data: { source: sourceKey, action, info },
              requestId
            }
          }, '*')
        })
      },
      destroy: () => destroy(new Error('用户结束了隔离音源会话'))
    }

    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow || !event.data || event.data.token !== token) return
      const message = event.data
      if (message.type === 'source-error') {
        destroy(new Error(cleanText(message.error, 240) || '音源脚本执行失败'))
        return
      }
      if (message.type === 'source-event' && message.eventName === 'inited') {
        if (initialized) return
        try {
          capabilities = normalizeLxSourceCapabilities(message.data)
          initialized = true
          initSettled = true
          clearTimeout(startupTimer)
          sessionTimer = setTimeout(() => destroy(new Error('隔离音源会话超过安全运行时限')), sessionLimit)
          resolve(session)
        } catch (error) {
          destroy(error)
        }
        return
      }
      if (message.type === 'source-response') {
        const pending = pendingActions.get(message.requestId)
        if (!pending) return
        pendingActions.delete(message.requestId)
        clearTimeout(pending.timer)
        if (message.ok) pending.resolve(message.value)
        else pending.reject(new Error(cleanText(message.error, 240) || '音源操作失败'))
        return
      }
      if (message.type === 'source-cancel') {
        pendingNetwork.get(message.requestId)?.abort()
        return
      }
      if (message.type === 'source-request') {
        if (activeNetworkCount >= MAX_ACTIVE_SOURCE_REQUESTS) {
          replyToWorker(message.requestId, { ok: false, error: '网络并发数量超过安全上限' })
          return
        }
        const controller = new AbortController()
        pendingNetwork.set(message.requestId, controller)
        activeNetworkCount += 1
        Promise.resolve().then(() => onRequest(message.url, message.options || {}, controller.signal)).then((response) => {
          replyToWorker(message.requestId, { ok: true, response })
        }).catch((error) => {
          replyToWorker(message.requestId, { ok: false, error: cleanText(error?.message || error, 240) || '请求被拒绝' })
        }).finally(() => {
          pendingNetwork.delete(message.requestId)
          activeNetworkCount -= 1
        })
      }
    }

    signal?.addEventListener('abort', onExternalAbort, { once: true })
    if (signal?.aborted) {
      onExternalAbort()
      return
    }
    startupTimer = setTimeout(() => destroy(new Error(`音源未在 ${Math.round(startupLimit / 1000)} 秒内完成初始化`)), startupLimit)
    window.addEventListener('message', handleMessage)
    iframe.addEventListener('load', () => {
      if (destroyed || !iframe.contentWindow) return
      iframe.contentWindow.postMessage({
        type: 'bootstrap',
        token,
        workerBootstrap,
        env: desktopSourceBridge() ? 'desktop' : 'web-sandbox',
        script: source.script,
        metadata: {
          name: source.name,
          description: source.description,
          version: source.version,
          author: source.author,
          homepage: source.homepage
        }
      }, '*')
    }, { once: true })
    document.body.appendChild(iframe)
  })
}

export async function runCustomSourceCompatibility(source, options = {}) {
  const session = await createCustomSourceSession(source, options)
  try {
    return {
      ...session.capabilities,
      sourceName: cleanText(source.name, 80),
      fileName: cleanText(source.fileName, 120)
    }
  } finally {
    session.destroy()
  }
}

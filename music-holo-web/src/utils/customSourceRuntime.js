import workerBootstrap from './customSourceWorker.js?raw'
import { parseCustomSourceUrl } from './customSources'

export const CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS = 15000
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

export async function performCustomSourceRequest(rawUrl, rawOptions = {}) {
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
        : 0
  if (bodyBytes > MAX_CUSTOM_SOURCE_REQUEST_BYTES) throw new Error('音源请求体超过 64 KB')

  const timeoutMs = Math.max(500, Math.min(15000, Number(options.timeout) || 10000))
  const controller = new AbortController()
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
    if (error?.name === 'AbortError') throw new Error('音源接口请求超时')
    if (error instanceof TypeError) {
      throw new Error('请求失败：目标站点可能不支持浏览器跨域访问（CORS），或网络不可达')
    }
    throw error
  } finally {
    clearTimeout(timer)
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
        worker.postMessage({ type: 'initialize', script: String(message.script || ''), metadata: message.metadata || {} });
        forward({ type: 'sandbox-ready' });
      } catch (error) {
        forward({ type: 'source-error', error: String(error && error.message || error) });
      }
      return;
    }
    if (!token || message.token !== token) return;
    if (message.type === 'request-result' && worker) worker.postMessage(message.payload);
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

export function runCustomSourceCompatibility(source, { onRequest = performCustomSourceRequest, timeoutMs = CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.reject(new Error('音源隔离检测只能在浏览器页面中运行'))
  }
  if (!source || typeof source.script !== 'string' || !source.script.trim()) {
    return Promise.reject(new Error('音源脚本为空'))
  }
  if (!document.body) return Promise.reject(new Error('页面尚未准备好，无法创建隔离环境'))

  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    const token = createRunToken()
    let completed = false
    let activeRequests = 0
    const maxWait = Math.max(1000, Math.min(30000, Number(timeoutMs) || CUSTOM_SOURCE_RUNTIME_TIMEOUT_MS))

    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('title', '自定义音源隔离检测')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none'
    iframe.srcdoc = createSandboxDocument()

    const cleanup = () => {
      clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
      iframe.remove()
    }
    const finish = (error, value) => {
      if (completed) return
      completed = true
      cleanup()
      if (error) reject(error)
      else resolve(value)
    }
    const replyToWorker = (requestId, result) => {
      if (completed || !iframe.contentWindow) return
      iframe.contentWindow.postMessage({
        type: 'request-result',
        token,
        payload: { type: 'request-result', requestId, ...result }
      }, '*')
    }
    const handleMessage = (event) => {
      if (event.source !== iframe.contentWindow || !event.data || event.data.token !== token) return
      const message = event.data
      if (message.type === 'source-error') {
        finish(new Error(cleanText(message.error, 240) || '音源脚本执行失败'))
        return
      }
      if (message.type === 'source-event' && message.eventName === 'inited') {
        try {
          const capabilities = normalizeLxSourceCapabilities(message.data)
          finish(null, { ...capabilities, sourceName: cleanText(source.name, 80), fileName: cleanText(source.fileName, 120) })
        } catch (error) {
          finish(error)
        }
        return
      }
      if (message.type === 'source-request') {
        if (activeRequests >= MAX_ACTIVE_SOURCE_REQUESTS) {
          replyToWorker(message.requestId, { ok: false, error: '并发请求数量超过安全上限' })
          return
        }
        activeRequests += 1
        Promise.resolve().then(() => onRequest(message.url, message.options || {})).then((response) => {
          replyToWorker(message.requestId, { ok: true, response })
        }).catch((error) => {
          replyToWorker(message.requestId, { ok: false, error: cleanText(error?.message || error, 240) || '请求被拒绝' })
        }).finally(() => {
          activeRequests -= 1
        })
      }
    }
    const timeout = setTimeout(() => finish(new Error(`音源未在 ${Math.round(maxWait / 1000)} 秒内完成初始化`)), maxWait)
    window.addEventListener('message', handleMessage)
    iframe.addEventListener('load', () => {
      if (completed || !iframe.contentWindow) return
      iframe.contentWindow.postMessage({
        type: 'bootstrap',
        token,
        workerBootstrap,
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

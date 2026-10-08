'use strict'

const nativeWorkerPostMessage = self.postMessage.bind(self)
const handlers = new Map()
const pendingRequests = new Map()
let requestSequence = 0
let sourceMetadata = {}

function sendParent(message) {
  nativeWorkerPostMessage(message)
}

function toBytes(value, encoding = 'utf8') {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  const text = String(value ?? '')
  const normalized = String(encoding || 'utf8').toLowerCase()
  if (normalized === 'hex') {
    const clean = text.replace(/\s+/g, '')
    if (clean.length % 2 || !/^[0-9a-f]*$/i.test(clean)) throw new Error('无效的十六进制数据')
    const bytes = new Uint8Array(clean.length / 2)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    return bytes
  }
  if (normalized === 'base64' || normalized === 'base64url') {
    const base64 = normalized === 'base64url' ? text.replace(/-/g, '+').replace(/_/g, '/') : text
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  }
  return new TextEncoder().encode(text)
}

function bytesToString(value, encoding = 'utf8') {
  const bytes = toBytes(value)
  const normalized = String(encoding || 'utf8').toLowerCase()
  if (normalized === 'hex') return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (normalized === 'base64' || normalized === 'base64url') {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary)
    return normalized === 'base64url' ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : encoded
  }
  if (normalized === 'latin1' || normalized === 'binary') return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return new TextDecoder(normalized === 'utf8' ? 'utf-8' : normalized, { fatal: false }).decode(bytes)
}

class SourceBuffer extends Uint8Array {
  toString(encoding = 'utf8') {
    return bytesToString(this, encoding)
  }

  static from(value, encoding = 'utf8') {
    return new SourceBuffer(toBytes(value, encoding))
  }
}

function md5(value) {
  const input = toBytes(value)
  const totalLength = Math.ceil((input.length + 9) / 64) * 64
  const padded = new Uint8Array(totalLength)
  padded.set(input)
  padded[input.length] = 0x80
  const bitLength = input.length * 8
  const lowBits = bitLength >>> 0
  const highBits = Math.floor(bitLength / 0x100000000) >>> 0
  const lengthOffset = totalLength - 8
  for (let byte = 0; byte < 4; byte += 1) {
    padded[lengthOffset + byte] = (lowBits >>> (byte * 8)) & 0xff
    padded[lengthOffset + 4 + byte] = (highBits >>> (byte * 8)) & 0xff
  }

  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let block = 0; block < padded.length; block += 64) {
    const words = new Uint32Array(16)
    for (let word = 0; word < 16; word += 1) {
      const offset = block + word * 4
      words[word] = (padded[offset] | (padded[offset + 1] << 8) | (padded[offset + 2] << 16) | (padded[offset + 3] << 24)) >>> 0
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let index = 0; index < 64; index += 1) {
      let f
      let wordIndex
      let shift
      if (index < 16) {
        f = (b & c) | (~b & d)
        wordIndex = index
        shift = shifts[index % 4]
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        wordIndex = (5 * index + 1) % 16
        shift = shifts[4 + (index % 4)]
      } else if (index < 48) {
        f = b ^ c ^ d
        wordIndex = (3 * index + 5) % 16
        shift = shifts[8 + (index % 4)]
      } else {
        f = c ^ (b | ~d)
        wordIndex = (7 * index) % 16
        shift = shifts[12 + (index % 4)]
      }
      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0
      const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0
      const nextB = (b + rotated) >>> 0
      a = d
      d = c
      c = b
      b = nextB
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24]
    .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('')
}

async function transformZlib(value, operation) {
  const Stream = operation === 'inflate' ? self.DecompressionStream : self.CompressionStream
  if (typeof Stream !== 'function') throw new Error(`${operation} 在此浏览器中不可用`)
  const stream = new Blob([toBytes(value)]).stream().pipeThrough(new Stream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const eventNames = Object.freeze({ inited: 'inited', request: 'request', updateAlert: 'updateAlert' })
const utils = Object.freeze({
  buffer: Object.freeze({ from: (value, encoding) => SourceBuffer.from(value, encoding), bufToString: bytesToString }),
  crypto: Object.freeze({
    md5,
    randomBytes: (size) => {
      const length = Math.max(0, Math.min(4096, Number(size) || 0))
      const bytes = new Uint8Array(length)
      self.crypto.getRandomValues(bytes)
      return new SourceBuffer(bytes)
    },
    aesEncrypt: async (value, mode, key, iv) => {
      const name = String(mode || 'AES-CBC').toUpperCase().includes('GCM') ? 'AES-GCM' : 'AES-CBC'
      const keyBytes = toBytes(key)
      const importedKey = await self.crypto.subtle.importKey('raw', keyBytes, { name }, false, ['encrypt'])
      const algorithm = { name, iv: toBytes(iv) }
      return new SourceBuffer(await self.crypto.subtle.encrypt(algorithm, importedKey, toBytes(value)))
    },
    rsaEncrypt: () => { throw new Error('RSA 加密接口未开放于 Web 安全运行时') }
  }),
  zlib: Object.freeze({ inflate: (value) => transformZlib(value, 'inflate'), deflate: (value) => transformZlib(value, 'deflate') })
})

function on(eventName, handler) {
  if (typeof eventName !== 'string' || typeof handler !== 'function') return
  const list = handlers.get(eventName) || []
  list.push(handler)
  handlers.set(eventName, list)
}

function send(eventName, data) {
  if (!Object.values(eventNames).includes(eventName)) return
  let normalizedData
  try {
    const serialized = JSON.stringify(data ?? null)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('音源初始化声明超过 64 KB')
    normalizedData = JSON.parse(serialized)
  } catch (error) {
    sendParent({ type: 'source-error', error: String(error?.message || '音源初始化声明无法序列化') })
    return
  }
  sendParent({ type: 'source-event', eventName, data: normalizedData })
}

function request(url, options, callback) {
  const requestId = `request-${++requestSequence}`
  const failRequest = (message) => {
    if (typeof callback === 'function') queueMicrotask(() => callback(new Error(message)))
    return () => {}
  }
  if (String(url || '').length > 4096) return failRequest('音源请求 URL 超过 4096 个字符')
  const normalizedOptions = {}
  if (options && typeof options === 'object') {
    if (options.method) normalizedOptions.method = String(options.method).toUpperCase()
    if (options.headers && typeof options.headers === 'object') {
      const headerEntries = Object.entries(options.headers).filter(([, value]) => value != null)
      if (headerEntries.length > 32 || headerEntries.some(([key, value]) => String(key).length > 128 || String(value).length > 2048)) {
        return failRequest('音源请求头超出数量或长度上限')
      }
      normalizedOptions.headers = Object.fromEntries(headerEntries.map(([key, value]) => [String(key), String(value)]))
    }
    if (typeof options.timeout === 'number') normalizedOptions.timeout = Math.max(500, Math.min(15000, options.timeout))
    if (typeof options.body === 'string' || options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body)) {
      normalizedOptions.body = options.body
    } else if (options.formData && typeof options.formData === 'object') {
      normalizedOptions.formData = Object.fromEntries(Object.entries(options.formData).map(([key, value]) => [key, String(value)]))
    } else if (options.form && typeof options.form === 'object') {
      normalizedOptions.form = Object.fromEntries(Object.entries(options.form).map(([key, value]) => [key, String(value)]))
    } else if (options.body != null) {
      normalizedOptions.body = JSON.stringify(options.body)
      normalizedOptions.headers = { ...(normalizedOptions.headers || {}), 'content-type': 'application/json' }
    }
  }
  const requestBody = normalizedOptions.body
  const bodyBytes = typeof requestBody === 'string'
    ? new TextEncoder().encode(requestBody).byteLength
    : requestBody instanceof ArrayBuffer
      ? requestBody.byteLength
      : ArrayBuffer.isView(requestBody)
        ? requestBody.byteLength
        : normalizedOptions.formData || normalizedOptions.form
          ? new TextEncoder().encode(JSON.stringify(normalizedOptions.formData || normalizedOptions.form)).byteLength
          : 0
  if (bodyBytes > 64 * 1024) return failRequest('音源请求体超过 64 KB')
  pendingRequests.set(requestId, typeof callback === 'function' ? callback : () => {})
  sendParent({ type: 'source-request', requestId, url: String(url || ''), options: normalizedOptions })
  return () => {
    pendingRequests.delete(requestId)
    sendParent({ type: 'source-cancel', requestId })
  }
}

function dispatch(eventName, data, requestId) {
  const listeners = handlers.get(eventName) || []
  if (listeners.length === 0) {
    sendParent({ type: 'source-response', requestId, ok: false, error: `未注册 ${eventName} 处理器` })
    return
  }
  Promise.resolve().then(async () => {
    const results = await Promise.all(listeners.map((listener) => listener(data)))
    const serialized = JSON.stringify(results[0] ?? null)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('音源操作返回值超过 64 KB')
    sendParent({ type: 'source-response', requestId, ok: true, value: JSON.parse(serialized) })
  }).catch((error) => {
    sendParent({ type: 'source-response', requestId, ok: false, error: String(error?.message || error) })
  })
}

function disableDirectCapabilities() {
  const unavailable = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'navigator', 'postMessage']
  for (const name of unavailable) {
    try { Object.defineProperty(globalThis, name, { configurable: false, enumerable: false, writable: false, value: undefined }) } catch {
      try { globalThis[name] = undefined } catch { /* The sandbox CSP remains the network boundary. */ }
    }
  }
}

self.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return
  if (message.type === 'initialize') {
    sourceMetadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {}
    disableDirectCapabilities()
    const lx = Object.freeze({
      EVENT_NAMES: eventNames,
      request,
      on,
      send,
      env: 'web-sandbox',
      version: '1.0.0',
      currentScriptInfo: Object.freeze({
        name: String(sourceMetadata.name || ''),
        description: String(sourceMetadata.description || ''),
        version: String(sourceMetadata.version || ''),
        author: String(sourceMetadata.author || ''),
        homepage: String(sourceMetadata.homepage || ''),
        rawScript: String(message.script || '')
      }),
      utils
    })
    Object.defineProperty(globalThis, 'lx', { configurable: false, enumerable: true, writable: false, value: lx })
    try {
      // Custom source code runs only in this disposable worker, never in the application page.
      new Function(String(message.script || ''))()
      sendParent({ type: 'source-loaded' })
    } catch (error) {
      sendParent({ type: 'source-error', error: String(error?.message || error) })
    }
    return
  }
  if (message.type === 'request-result') {
    const callback = pendingRequests.get(message.requestId)
    if (!callback) return
    pendingRequests.delete(message.requestId)
    if (message.ok) callback(null, message.response, message.response?.body)
    else callback(new Error(String(message.error || '网络请求失败')))
    return
  }
  if (message.type === 'dispatch') dispatch(message.eventName, message.data, message.requestId)
})

self.addEventListener('unhandledrejection', (event) => {
  sendParent({ type: 'source-error', error: String(event.reason?.message || event.reason || '脚本异步错误') })
})

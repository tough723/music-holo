// 本机开放 HTTP API：默认关闭，开启后只监听 127.0.0.1，必须带令牌。
//
// 安全约束：
// - 只绑定回环地址，不对外网暴露；每个响应都带 no-store 与最小 CORS 头；
// - 所有写操作需要 Authorization: Bearer <token> 或 ?token=（仅在显式开启时生成）；
// - 请求频率受限；未知路径 404；不代理任何第三方请求；
// - 每个命令都转交主窗口渲染进程执行，主进程自己不碰播放状态或曲库数据。
const http = require('node:http')
const { randomUUID } = require('node:crypto')

const RATE_LIMIT = { windowMs: 10_000, max: 60 }
const COMMAND_TIMEOUT_MS = 4000

const READ_ENDPOINTS = new Set(['/api/status', '/api/queue', '/api/events'])

class LocalApiServer {
  constructor({ getToken, requestRenderer, logger = () => {} }) {
    this.getToken = getToken
    this.requestRenderer = requestRenderer
    this.logger = logger
    this.server = null
    this.hits = new Map()
    this.subscribers = new Set()
  }

  get running() {
    return Boolean(this.server?.listening)
  }

  get port() {
    return this.server?.address()?.port || 0
  }

  async start(port = 17320) {
    if (this.running) return this.port
    this.server = http.createServer((request, response) => this.handle(request, response))
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(port, '127.0.0.1', resolve)
    })
    this.logger(`本机 API 已开启：http://127.0.0.1:${this.port}`)
    return this.port
  }

  async stop() {
    if (!this.running) return
    for (const response of this.subscribers) {
      try { response.end() } catch { /* 订阅方已断开 */ }
    }
    this.subscribers.clear()
    await new Promise((resolve) => this.server.close(resolve))
    this.server = null
  }

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const response of this.subscribers) {
      try { response.write(payload) } catch { this.subscribers.delete(response) }
    }
  }

  rateLimited(key) {
    const now = Date.now()
    const entry = this.hits.get(key)
    if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
      this.hits.set(key, { start: now, count: 1 })
      return false
    }
    entry.count += 1
    return entry.count > RATE_LIMIT.max
  }

  authorized(request, url) {
    const token = this.getToken()
    if (!token) return false
    const header = String(request.headers.authorization || '')
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
    return bearer === token || url.searchParams.get('token') === token
  }

  async handle(request, response) {
    const url = new URL(request.url, `http://127.0.0.1:${this.port || 80}`)
    // 不服务任何静态资源、不代理第三方：只暴露下面几个明确的路径。
    if (!url.pathname.startsWith('/api/')) return this.json(response, 404, { error: 'not_found' })
    if (request.method === 'OPTIONS') return this.options(response)
    if (this.rateLimited(request.socket.remoteAddress || 'local')) return this.json(response, 429, { error: 'too_many_requests' })
    if (!this.authorized(request, url)) return this.json(response, 401, { error: 'unauthorized' })

    if (url.pathname === '/api/events') return this.subscribe(response)
    const body = await readBody(request).catch(() => ({}))
    const command = url.pathname.replace(/^\/api\//, '')
    if (!/^[\w-]{1,32}$/.test(command)) return this.json(response, 404, { error: 'not_found' })
    try {
      const result = await this.dispatch(command, body)
      this.json(response, 200, { ok: true, result })
    } catch (error) {
      this.json(response, 502, { ok: false, error: String(error?.message || error) })
    }
  }

  /** 命令一律转给主窗口执行，主进程不持有播放状态。 */
  dispatch(command, payload) {
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => reject(new Error('渲染进程未在 4 秒内响应')), COMMAND_TIMEOUT_MS)
      this.requestRenderer(command, payload || {}, (error, value) => {
        clearTimeout(timer)
        if (error) reject(new Error(String(error?.message || error)))
        else resolve(value ?? null)
      }, id)
    })
  }

  subscribe(response) {
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    })
    response.write(': music-holo local api\n\n')
    this.subscribers.add(response)
    request_keepalive(response, () => this.subscribers.delete(response))
  }

  options(response) {
    response.writeHead(204, {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '600'
    })
    response.end()
  }

  json(response, status, payload) {
    const body = JSON.stringify(payload)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
      'x-content-type-options': 'nosniff'
    })
    response.end(body)
  }
}

function request_keepalive(response, cleanup) {
  const timer = setInterval(() => {
    try { response.write(': ping\n\n') } catch { /* 断开 */ }
  }, 15000)
  response.on('close', () => {
    clearInterval(timer)
    cleanup()
  })
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('请求体不是合法 JSON')) }
    })
    request.on('error', reject)
  })
}

module.exports = { LocalApiServer, RATE_LIMIT, READ_ENDPOINTS }

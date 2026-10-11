/**
 * 桌面系统集成：启动参数解析、全局快捷键校验、本机 API 的鉴权与限流。
 * 这些能力默认关闭，且本机 API 只监听回环地址并强制令牌校验。
 */
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { parseDeepLink } = require('../deep-link.cjs')
const { ShortcutController, isValidAccelerator, SHORTCUT_COMMANDS } = require('../shortcuts.cjs')
const { LocalApiServer } = require('../local-api.cjs')

test('music-holo:// 只接受白名单动作并截断超长参数', () => {
  assert.deepEqual(parseDeepLink('music-holo://search?q=海阔天空'), { action: 'search', params: { q: '海阔天空' } })
  assert.deepEqual(parseDeepLink('music-holo://import?url=https%3A%2F%2Fmusic.163.com%2F%23%2Fplaylist%3Fid%3D123'), {
    action: 'import',
    params: { url: 'https://music.163.com/#/playlist?id=123' }
  })
  assert.deepEqual(parseDeepLink('music-holo://lyrics'), { action: 'lyrics', params: {} })
  // 未知动作、非法协议、恶意参数都直接丢弃。
  assert.equal(parseDeepLink('music-holo://exec?cmd=rm -rf /'), null)
  assert.equal(parseDeepLink('http://example.org/search?q=x'), null)
  assert.equal(parseDeepLink('not a url'), null)
  const long = parseDeepLink(`music-holo://search?q=${'x'.repeat(900)}`)
  assert.equal(long.params.q.length, 512)
})

test('快捷键只接受 Electron 风格的加速器', () => {
  for (const ok of ['Ctrl+Alt+P', 'CommandOrControl+Shift+N', 'MediaPlayPause', 'F5', 'Alt+Space']) {
    assert.equal(isValidAccelerator(ok), true, `${ok} 应被接受`)
  }
  for (const bad of ['', 'rm -rf /', 'Ctrl+Alt+A+B+C+D', 'Ctrl+<script>', 'Ctrl+'] ) {
    assert.equal(isValidAccelerator(bad), false, `${bad} 应被拒绝`)
  }
  assert.ok(SHORTCUT_COMMANDS.includes('toggle'))
})

test('快捷键只注册媒体键与校验通过的自定义组合键', () => {
  const registered = []
  const stub = {
    register: (accelerator, handler) => {
      if (accelerator === 'CommandOrControl+Shift+N') return false // 模拟被系统占用
      registered.push(accelerator)
      handler()
      return true
    },
    unregister: (accelerator) => { registered.splice(registered.indexOf(accelerator), 1) }
  }
  const commands = []
  const shortcuts = new ShortcutController({ onCommand: (command) => commands.push(command), globalShortcut: stub })
  const list = shortcuts.apply({
    mediaKeys: true,
    custom: { toggle: 'Ctrl+Alt+P', next: 'CommandOrControl+Shift+N', evil: 'rm -rf /' }
  })
  assert.deepEqual(list.map((item) => item.accelerator), ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'Ctrl+Alt+P'])
  assert.ok(commands.includes('toggle'))
  // 未通过校验的组合键不会进入注册表。
  assert.equal(list.some((item) => String(item.accelerator).includes('rm -rf')), false)
  shortcuts.unregisterAll()
  assert.equal(registered.length, 0)
})

function createServer(options = {}) {
  const api = new LocalApiServer({
    getToken: () => 'test-token',
    requestRenderer: options.handler || ((command, payload, callback) => callback(null, { command, payload })),
    logger: () => {}
  })
  return api
}

function request(port, path, { method = 'GET', token = 'test-token', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const request = http.request({
      host: '127.0.0.1', port, path, method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {})
      }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: response.headers }))
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
}

test('本机 API 只监听回环地址、强制令牌、拒绝非 API 路径并限流', async () => {
  const api = createServer()
  const port = await api.start(0)
  const address = api.server.address()
  assert.equal(address.address, '127.0.0.1')

  const unauthorized = await request(port, '/api/status', { token: null })
  assert.equal(unauthorized.status, 401)
  const notFound = await request(port, '/index.html')
  assert.equal(notFound.status, 404)
  const ok = await request(port, '/api/status')
  assert.equal(ok.status, 200)
  assert.equal(JSON.parse(ok.body).ok, true)
  assert.equal(ok.headers['cache-control'], 'no-store')

  // 限流：短时间大量请求会被拒绝，避免本机脚本把播放器打满。
  let limited = false
  for (let index = 0; index < 80; index += 1) {
    const response = await request(port, '/api/status')
    if (response.status === 429) { limited = true; break }
  }
  assert.equal(limited, true)
  await api.stop()
})

test('本机 API 的命令交给渲染进程执行，超时与错误如实返回', async () => {
  const api = createServer({
    handler: (command, payload, callback) => {
      if (command === 'boom') callback(new Error('播放器拒绝'))
      else callback(null, { ok: command })
    }
  })
  const port = await api.start(0)
  const ok = await request(port, '/api/toggle', { method: 'POST', body: {} })
  assert.deepEqual(JSON.parse(ok.body), { ok: true, result: { ok: 'toggle' } })
  const failed = await request(port, '/api/boom', { method: 'POST', body: {} })
  assert.equal(failed.status, 502)
  assert.match(failed.body, /播放器拒绝/)
  // 非法命令名不会进入渲染进程。
  const bad = await request(port, '/api/../escape', { method: 'POST', body: {} })
  assert.equal(bad.status, 404)

  const hanging = createServer({ handler: () => { /* 不回调，模拟渲染进程无响应 */ } })
  const hangingPort = await hanging.start(0)
  const timeout = await request(hangingPort, '/api/next', { method: 'POST', body: {} })
  assert.equal(timeout.status, 502)
  assert.match(timeout.body, /4 秒/)
  await Promise.all([api.stop(), hanging.stop()])
})

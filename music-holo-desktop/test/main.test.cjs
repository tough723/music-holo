const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { EventEmitter } = require('node:events')
const { Readable } = require('node:stream')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const localRequire = createRequire(path.join(root, 'main.cjs'))
async function harness() {
  const app = new EventEmitter(); app.isPackaged = false; app.whenReady = () => Promise.resolve(); app.quit = () => {}
  const ipc = new Map(), protocols = new Map(), captures = [], fetches = []
  let window, allow = true
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.webContents = new EventEmitter()
      this.webContents.mainFrame = { url: 'app://music-holo/#/settings' }
      this.webContents.setWindowOpenHandler = () => {}
      this.webContents.send = (channel, payload) => { this.webContents.emit(channel, payload) }
      window = this
    }
    loadURL() {}
    isDestroyed() { return false }
  }
  const electron = {
    app, BrowserWindow: Window,
    protocol: { registerSchemesAsPrivileged: () => {}, handle: (name, handler) => protocols.set(name, handler) },
    ipcMain: { handle: (name, handler) => ipc.set(name, handler), on: (name, handler) => ipc.set(`on:${name}`, handler) },
    dialog: { showMessageBox: async () => ({ response: allow ? 1 : 0 }) },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    net: { fetch: async (url, options) => { fetches.push({ url, options }); return new Response('test', { headers: { 'content-type': 'text/plain' } }) } },
    // 桌面集成能力（托盘 / 全局快捷键 / 歌词窗）在测试里用桩替代，只验证接线与命令转发。
    Tray: class Tray { constructor(icon) { this.icon = icon; trays.push(this) } setToolTip() {} setContextMenu(menu) { this.menu = menu } destroy() { trays.splice(trays.indexOf(this), 1) } },
    Menu: { buildFromTemplate: (template) => ({ template }) },
    nativeImage: { createEmpty: () => ({ empty: true }) },
    globalShortcut: { register: (accelerator, handler) => { shortcuts.push({ accelerator, handler }); return true }, unregister: (accelerator) => { const index = shortcuts.findIndex((item) => item.accelerator === accelerator); if (index >= 0) shortcuts.splice(index, 1) } },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 800 } }) },
  }
  const trays = [], shortcuts = []
  const transport = { sourceRequest: async () => ({}), openPublicResponse: async (url, options) => {
    captures.push({ url, options })
    const stream = Readable.from([Buffer.from('wave')]); stream.statusCode = options.headers.range ? 206 : 200
    stream.headers = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': '4', 'content-range': 'bytes 0-3/4', 'set-cookie': 'secret' }
    return stream
  } }
  vm.runInNewContext(readFileSync(path.join(root, 'main.cjs'), 'utf8'), {
    require: (name) => name === 'electron' ? electron : name === './transport.cjs' ? transport : localRequire(name),
    __dirname: root, process: { env: {}, platform: 'linux' },
    URL, Response, Headers, Buffer, AbortController, setTimeout, clearTimeout,
  })
  await new Promise((resolve) => setImmediate(resolve))
  const invoke = (name, ...args) => ipc.get(name)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, ...args)
  return { app, window, invoke, serve: protocols.get('app'), captures, fetches, trays, shortcuts, deny: () => { allow = false } }
}
test('native media tickets stream Range, strip cookies, reject unknown IDs and revoke on reload', async (t) => {
  const h = await harness(); t.after(() => h.app.emit('before-quit'))
  assert.equal(h.window.options.webPreferences.sandbox, true)
  assert.equal(h.window.options.webPreferences.webSecurity, true)
  const ticket = await h.invoke('source:media', 'https://media.example.com/a.wav')
  assert.match(ticket, /^app:\/\/music-holo\/__source_media\//)
  const response = await h.serve(new Request(ticket, { headers: { Range: 'bytes=0-3', Cookie: 'private' } }))
  assert.equal(response.status, 206); assert.equal(await response.text(), 'wave')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(h.captures[0].options.headers.range, 'bytes=0-3')
  assert.equal(h.captures[0].options.headers.Cookie, undefined)
  assert.equal((await h.serve(new Request(ticket, { headers: { Range: 'bytes=0-1,3-4' } }))).status, 400)
  assert.equal((await h.serve(new Request(`${ticket}-wrong`))).status, 404)
  h.window.webContents.emit('did-start-navigation', {}, 'app://music-holo/', false, true)
  assert.equal((await h.serve(new Request(ticket))).status, 404)
})
test('media denial/private targets never create a stream; HEAD has no body', async (t) => {
  const h = await harness(); t.after(() => h.app.emit('before-quit'))
  await assert.rejects(h.invoke('source:media', 'http://127.0.0.1/a.wav'))
  const ticket = await h.invoke('source:media', 'https://media.example.com/a.wav')
  const response = await h.serve(new Request(ticket, { method: 'HEAD' }))
  assert.equal(await response.text(), '')
  h.deny()
  await assert.rejects(h.invoke('source:media', 'https://denied.example.com/a.wav'), /拒绝/)
  assert.equal(h.captures.length, 1)
})
test('business API target is fixed and separate from source credentials', async (t) => {
  const h = await harness(); t.after(() => h.app.emit('before-quit'))
  const response = await h.serve(new Request('app://music-holo/api/auth/me?url=https://evil.example.com', { headers: { Cookie: 'secret', 'music-holo-token': 'account-token' } }))
  assert.equal(response.status, 200)
  const { url, options } = h.fetches[0]
  assert.equal(new URL(url).origin, 'http://127.0.0.1:8080')
  assert.equal(new URL(url).pathname, '/auth/me')
  assert.equal(options.headers.get('cookie'), null)
  assert.equal(options.headers.get('music-holo-token'), 'account-token')
  assert.equal(options.redirect, 'error')
  assert.equal((await h.serve(new Request('app://evil.example.com/api/auth/me'))).status, 403)
})

test('桌面集成：托盘与快捷键只转发命令，本机 API 需要令牌并转交渲染进程', async (t) => {
  const h = await harness()
  t.after(() => h.app.emit('before-quit'))
  const commands = []
  const apiCalls = []
  const deepLinks = []
  h.window.webContents.on('desktop:command', (message) => commands.push(message))
  h.window.webContents.on('desktop:api', (message) => apiCalls.push(message))
  h.window.webContents.on('desktop:deep-link', (message) => deepLinks.push(message))

  await h.invoke('integration:configure', { tray: true, mediaKeys: true, customShortcuts: { toggle: 'Ctrl+Alt+P', evil: 'rm -rf /' } })
  assert.equal(h.trays.length, 1)
  assert.equal(h.shortcuts.some((item) => item.accelerator === 'MediaPlayPause'), true)
  assert.equal(h.shortcuts.some((item) => item.accelerator === 'Ctrl+Alt+P'), true)
  assert.equal(h.shortcuts.some((item) => String(item.accelerator).includes('rm -rf')), false)

  // 托盘菜单点击 → 只发出命令，不直接操作播放状态。
  const menu = h.trays[0].menu.template
  // 注意：命令对象来自 vm 沙箱，跨 realm 用 JSON 比较而不是引用比较。
  menu.find((item) => item.label === '播放').click()
  assert.equal(commands.at(-1).command, 'toggle')
  // 媒体键快捷键 → 同样只发出命令。
  h.shortcuts.find((item) => item.accelerator === 'MediaNextTrack').handler()
  assert.equal(commands.at(-1).command, 'next')

  // 本机 API：开启后必须带令牌，命令转交渲染进程并由它回传结果。
  await h.invoke('integration:configure', { localApi: true, localApiPort: 0 })
  const config = await h.invoke('integration:get')
  assert.ok(config.localApiToken)
  assert.ok(config.localApiPort > 0)
  const call = (path, token, body) => new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const request = http.request({
      host: '127.0.0.1', port: config.localApiPort, path, method: body ? 'POST' : 'GET',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { 'content-type': 'application/json' } : {}) }
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    if (payload) request.write(payload)
    request.end()
  })
  const unauthorized = await call('/api/status', null)
  assert.equal(unauthorized.status, 401)
  const pending = call('/api/volume', config.localApiToken, { value: 0.4 })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(apiCalls.length, 1)
  assert.equal(apiCalls[0].command, 'volume')
  await h.invoke('integration:apiRespond', { id: apiCalls[0].id, result: { volume: 0.4 } })
  const answered = await pending
  assert.equal(answered.status, 200)
  assert.match(answered.body, /"volume":0\.4/)
  await h.invoke('integration:configure', { localApi: false })

  // 启动参数：只把可识别的意图交给渲染进程。
  h.app.emit('second-instance', {}, ['music-holo://search?q=%E6%B5%B7%E9%98%94%E5%A4%A9%E7%A9%BA'])
  h.app.emit('second-instance', {}, ['music-holo://exec?cmd=rm'])
  assert.equal(deepLinks.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(deepLinks[0])), { action: 'search', params: { q: '海阔天空' } })

  // 关闭集成：托盘销毁、媒体键注销；自定义组合键需显式清空才会释放。
  await h.invoke('integration:configure', { tray: false, mediaKeys: false })
  assert.equal(h.trays.length, 0)
  assert.equal(h.shortcuts.filter((item) => item.accelerator.startsWith('Media')).length, 0)
  assert.equal(h.shortcuts.filter((item) => item.accelerator === 'Ctrl+Alt+P').length, 1)
  await h.invoke('integration:configure', { customShortcuts: {} })
  assert.equal(h.shortcuts.length, 0)
})

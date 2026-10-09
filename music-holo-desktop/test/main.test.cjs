const { test } = require('node:test')
const assert = require('node:assert/strict')
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
      this.webContents.setWindowOpenHandler = () => {}; window = this
    }
    loadURL() {}
    isDestroyed() { return false }
  }
  const electron = {
    app, BrowserWindow: Window,
    protocol: { registerSchemesAsPrivileged: () => {}, handle: (name, handler) => protocols.set(name, handler) },
    ipcMain: { handle: (name, handler) => ipc.set(name, handler) },
    dialog: { showMessageBox: async () => ({ response: allow ? 1 : 0 }) },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    net: { fetch: async (url, options) => { fetches.push({ url, options }); return new Response('test', { headers: { 'content-type': 'text/plain' } }) } },
  }
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
  return { app, window, invoke, serve: protocols.get('app'), captures, fetches, deny: () => { allow = false } }
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

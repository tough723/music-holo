const { app, BrowserWindow, protocol, net, ipcMain, dialog, session } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { Readable, Transform } = require('node:stream')
const { sourceUrl } = require('./policy.cjs')
const { sourceRequest, openPublicResponse } = require('./transport.cjs')
const { SourceSessions } = require('./sessions.cjs')
const { assertTrustedSender } = require('./ipc-security.cjs')
const { mediaRange, mediaContentType } = require('./media-policy.cjs')
const { DownloadManager } = require('./downloads.cjs')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const APP_URL = 'app://music-holo/'
let win, sources, downloads
const mediaTickets = new Map()
const mediaControllers = new Set()
const promptControllers = new Set()
let mediaPrompts = 0
let generation = 0
const backend = new URL(process.env.MUSIC_HOLO_BACKEND || 'http://127.0.0.1:8080')
if (backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash ||
    !(backend.protocol === 'https:' || (backend.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)))) {
  throw new Error('MUSIC_HOLO_BACKEND 必须是 HTTPS 服务源，或本机 HTTP 服务源（不含路径和凭据）')
}
const deniedHosts = [backend.hostname.toLowerCase().replace(/\.$/, '')]
const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../music-holo-web/dist')
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; frame-src 'self'; connect-src 'self' https:; img-src 'self' https: data: blob:; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'"
async function confirm(name, url, signal) {
  if (!win || win.isDestroyed() || signal?.aborted) return false
  const result = await dialog.showMessageBox(win, {
    signal, type: 'warning', title: '授权音源访问',
    message: `${name} 请求访问 ${url.origin}`,
    detail: `${url.protocol === 'http:' ? '注意：HTTP 为明文传输。\n' : ''}仅本次会话允许。不发送 Music Holo 登录凭据或 Cookie；公网 DNS 校验、超时与大小限制仍生效。请仅允许可信且获授权的音源。`,
    buttons: ['拒绝', '仅本次允许'], defaultId: 0, cancelId: 0, noLink: true,
  })
  return result.response === 1
}
function reset() {
  generation++
  sources?.closeAll(); downloads?.cancelAll(); mediaTickets.clear()
  for (const controller of promptControllers) controller.abort()
  promptControllers.clear()
  for (const controller of mediaControllers) controller.abort()
  mediaControllers.clear()
}
/** 所有 IPC 都校验发送方是主窗口，且只暴露最小能力。 */
const handle = (name, callback) => ipcMain.handle(name, (event, ...args) => { assertTrustedSender(event, win); return callback(...args) })

function registerDownloadIpc() {
  handle('download:pickDirectory', async () => {
    if (!win || win.isDestroyed()) return ''
    const result = await dialog.showOpenDialog(win, {
      title: '选择下载保存目录', properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    })
    return result.canceled || !result.filePaths.length ? '' : result.filePaths[0]
  })
  handle('download:pickPath', async (fileName) => {
    if (!win || win.isDestroyed()) return ''
    const result = await dialog.showSaveDialog(win, {
      title: '保存音频文件', defaultPath: String(fileName || 'music-holo-track.mp3'),
      properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent']
    })
    return result.canceled || !result.filePath ? '' : result.filePath
  })
  handle('download:start', (job) => downloads.start(job || {}))
  handle('download:cancel', (id) => downloads.cancel(id))
  handle('download:show', (target) => {
    const file = String(target || '')
    if (file) require('electron').shell.showItemInFolder(file)
  })
  handle('download:openPath', (target) => {
    const file = String(target || '')
    return file ? require('electron').shell.openPath(file) : ''
  })
}

function registerIpc() {
  handle('source:open', (name) => sources.open(name))
  handle('source:close', (id) => sources.close(id))
  handle('source:cancel', (id, requestId) => sources.cancel(id, requestId))
  handle('source:request', (id, requestId, url, options) => sources.run(id, requestId, url, options))
  registerDownloadIpc()
  handle('source:media', async (rawUrl) => {
    const url = sourceUrl(rawUrl, deniedHosts)
    if (mediaTickets.size + mediaPrompts >= 256 || mediaPrompts >= 2) throw new Error('临时媒体数量或授权并发超过限制，请重启客户端清理')
    const owner = win.webContents.mainFrame
    const epoch = generation
    mediaPrompts++
    const promptController = new AbortController()
    promptControllers.add(promptController)
    try {
      if (!await confirm('自定义音源媒体（本窗口有效）', url, promptController.signal)) throw new Error('用户拒绝媒体加载')
      if (!win || win.isDestroyed() || owner !== win.webContents.mainFrame || epoch !== generation) throw new Error('页面已经关闭')
      const ticket = randomUUID()
      mediaTickets.set(ticket, url.href)
      return `${APP_URL}__source_media/${ticket}`
    } finally { mediaPrompts--; promptControllers.delete(promptController) }
  })
}
async function serveMedia(request, ticket) {
  const target = mediaTickets.get(ticket)
  if (!target || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
  if (mediaControllers.size >= 8) return new Response('Too many streams', { status: 429 })
  const headers = {}
  try {
    const range = mediaRange(request.headers.get('range'))
    if (range) headers.range = range
  } catch { return new Response('Invalid range', { status: 400 }) }
  const controller = new AbortController()
  mediaControllers.add(controller)
  const abort = () => controller.abort()
  request.signal.addEventListener('abort', abort, { once: true })
  if (request.signal.aborted) controller.abort()
  // Bound initial DNS/connection and the overall stream separately.
  const startup = setTimeout(abort, 15000)
  const lifetime = setTimeout(abort, 2 * 60 * 60 * 1000)
  const cleanup = () => {
    clearTimeout(startup); clearTimeout(lifetime)
    request.signal.removeEventListener('abort', abort); mediaControllers.delete(controller)
  }
  try {
    const upstream = await openPublicResponse(target, { method: request.method, headers }, { deniedHosts, signal: controller.signal })
    clearTimeout(startup)
    upstream.once('close', cleanup)
    const resultHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'" }
    for (const key of ['content-length', 'content-range', 'accept-ranges']) if (upstream.headers[key]) resultHeaders[key] = upstream.headers[key]
    try { resultHeaders['content-type'] = mediaContentType(upstream.headers['content-type']) }
    catch { upstream.destroy(); throw new Error('媒体响应类型被拒绝') }
    if (request.method === 'HEAD' || [204, 205, 304].includes(upstream.statusCode)) {
      upstream.destroy(); return new Response(null, { status: upstream.statusCode, headers: resultHeaders })
    }
    let bytes = 0
    const limiter = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length
      callback(bytes > 1024 * 1024 * 1024 ? new Error('媒体超过 1 GB') : null, chunk)
    } })
    upstream.on('error', (error) => limiter.destroy(error))
    limiter.once('close', () => { upstream.destroy(); cleanup() })
    upstream.pipe(limiter)
    return new Response(Readable.toWeb(limiter), { status: upstream.statusCode, headers: resultHeaders })
  } catch { cleanup(); return new Response('Media request rejected', { status: 502 }) }
}
async function serveApp(request) {
  const url = new URL(request.url)
  if (url.hostname !== 'music-holo') return new Response('Forbidden', { status: 403 })
  if (url.pathname.startsWith('/__source_media/')) return serveMedia(request, url.pathname.slice('/__source_media/'.length))
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/profile/')) {
    // Application API is an explicit administrator-configured target, never a script-controlled URL.
    const target = new URL(backend.href)
    target.pathname = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname
    target.search = url.search
    const headers = new Headers(request.headers)
    for (const key of ['host', 'cookie', 'origin', 'referer']) headers.delete(key)
    try {
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
      if (body?.byteLength > 32 * 1024 * 1024) return new Response('Upload too large', { status: 413 })
      const response = await net.fetch(target.href, { method: request.method, headers, body, redirect: 'error', credentials: 'omit', signal: request.signal })
      const output = new Headers(response.headers); output.delete('set-cookie')
      return new Response(response.body, { status: response.status, headers: output })
    } catch { return Response.json({ code: 503, msg: '桌面客户端无法连接配置的业务后端' }, { status: 503 }) }
  }
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
  try {
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = path.resolve(webRoot, `.${relative}`)
    if (!file.startsWith(`${webRoot}${path.sep}`)) return new Response('Forbidden', { status: 403 })
    const response = await net.fetch(pathToFileURL(file).href)
    const headers = new Headers(response.headers)
    headers.set('content-security-policy', CSP); headers.set('x-content-type-options', 'nosniff')
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
  } catch { return new Response('请先构建 music-holo-web，再启动桌面客户端。', { status: 404 }) }
}
function createWindow() {
  win = new BrowserWindow({
    title: 'Music Holo', width: 1280, height: 860, minWidth: 760, minHeight: 600,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  win.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) reset() })
  win.on('closed', () => { reset(); win = null })
  win.loadURL(APP_URL)
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  sources = new SourceSessions({ confirm, request: sourceRequest, deniedHosts })
  downloads = new DownloadManager({ emit: (event) => { if (win && !win.isDestroyed()) win.webContents.send('download:event', event) } })
  protocol.handle('app', serveApp)
  registerIpc(); createWindow()
  app.on('activate', () => { if (!win) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', reset)

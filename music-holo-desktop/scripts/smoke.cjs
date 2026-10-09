// Desktop-only integration test. No permissive test flags are added to the app.
// Mock networking from Playwright's main-process debugger, never from a renderer.
const { _electron: electron, expect } = require('../../music-holo-web/node_modules/@playwright/test')
const { mkdtemp, rm, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
/** 把失败原因写进 GitHub 步骤摘要与注解，方便在没有完整日志时定位。 */
function reportFailure(error, url, pageErrors = []) {
  const detail = [
    `失败页面：${url}`,
    `错误：${error?.message || String(error)}`,
    pageErrors.length ? `页面异常：\n${pageErrors.map((item) => `  - ${item}`).join('\n')}` : '',
    '```',
    String(error?.stack || '').slice(0, 4000),
    '```'
  ].filter(Boolean).join('\n')
  try {
    if (process.env.GITHUB_STEP_SUMMARY) require('node:fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 桌面烟测失败\n\n${detail}\n`)
  } catch { /* 摘要写入失败不影响退出码 */ }
  console.log(`::error title=Desktop smoke failed::${detail.replace(/\n/g, '%0A')}`)
}

async function main() {
  const profile = await mkdtemp(path.join(tmpdir(), 'music-holo-desktop-'))
  let application, page
  const artifacts = path.resolve(__dirname, '../test-results')
  await mkdir(artifacts, { recursive: true })
  try {
    application = await electron.launch({
      executablePath: require('electron'),
      chromiumSandbox: true, // Playwright otherwise injects --no-sandbox on Linux.
      args: [path.resolve(__dirname, '..'), `--user-data-dir=${profile}`],
      timeout: 30000,
    })
    await application.evaluate(({ app, BrowserWindow, dialog, net }) => {
      if (app.commandLine.hasSwitch('no-sandbox')) throw new Error('Chromium sandbox must not be disabled by the test runner')
      const require = process.mainModule.require.bind(process.mainModule)
      const { EventEmitter } = require('node:events')
      const { Readable } = require('node:stream')
      globalThis.smokeRequests = []; globalThis.smokeApprovals = []; globalThis.smokeBackendRequests = []
      const originalFetch = net.fetch.bind(net)
      net.fetch = (url, options) => {
        if (/^https?:/.test(String(url))) { globalThis.smokeBackendRequests.push(String(url)); throw new Error('Guest smoke must not need a backend') }
        return originalFetch(url, options)
      }
      globalThis.smokeDeny = false
      dialog.showMessageBox = async (_window, options) => {
        globalThis.smokeApprovals.push(options.message)
        return { response: globalThis.smokeDeny ? 0 : 1 }
      }
      require('node:dns/promises').lookup = async () => [{ address: '8.8.8.8', family: 4 }]
      require('node:https').request = (url, options, callback) => {
        globalThis.smokeRequests.push({ url: url.href, headers: options.headers })
        const req = new EventEmitter()
        req.setTimeout = () => {}; req.write = () => {}; req.destroy = (error) => req.emit('error', error)
        req.end = () => queueMicrotask(() => {
          let body = Buffer.from('{"ready":true}')
          let type = 'application/json', status = 200, rangeHeaders = {}
          if (url.pathname.endsWith('.wav')) {
            body = Buffer.alloc(44 + 16000)
            body.write('RIFF'); body.writeUInt32LE(body.length - 8, 4); body.write('WAVEfmt ', 8)
            body.writeUInt32LE(16, 16); body.writeUInt16LE(1, 20); body.writeUInt16LE(1, 22)
            body.writeUInt32LE(8000, 24); body.writeUInt32LE(16000, 28)
            body.writeUInt16LE(2, 32); body.writeUInt16LE(16, 34); body.write('data', 36); body.writeUInt32LE(16000, 40)
            type = 'audio/wav'
            const match = /^bytes=(\d+)-(\d*)$/.exec(options.headers.range || '')
            if (match) {
              const total = body.length, start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1
              rangeHeaders = { 'content-range': `bytes ${start}-${end}/${total}` }
              body = body.subarray(start, end + 1); status = 206
            }
          }
          const response = Readable.from([body]); response.statusCode = status
          response.headers = { 'content-type': type, 'content-length': String(body.length), 'accept-ranges': 'bytes', ...rangeHeaders }
          callback(response)
        })
        return req
      }
      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      if (!preferences.contextIsolation || !preferences.sandbox || preferences.nodeIntegration || !preferences.webSecurity) throw new Error('Unsafe desktop preferences')
    })
    page = await application.firstWindow()
    await application.context().tracing.start({ screenshots: true, snapshots: true })
    page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) console.log(`[renderer ${message.type()}] ${message.text()}`) })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForURL('**/#/sources')
    expect(await page.evaluate(() => typeof require)).toBe('undefined')
    expect(await page.evaluate(() => musicHoloDesktop.version)).toBe('0.1.0')
    expect(await page.evaluate(() => localStorage.getItem('mh_token'))).toBeNull()
    await expect(page.getByRole('heading', { name: '本机音源工作台' })).toBeVisible()
    await expect(page.getByText('桌面隔离模式')).toBeVisible()
    const script = `/**\n * @name 桌面测试源\n * @version 1.0\n */
const lx = globalThis.lx
if (lx.env !== 'desktop' || typeof require !== 'undefined' || typeof process !== 'undefined' || typeof fetch !== 'undefined' || typeof musicHoloDesktop !== 'undefined') throw new Error('脚本隔离或环境失败')
lx.on(lx.EVENT_NAMES.request, async ({ action }) => {
  if (action === 'musicUrl') return 'https://media.example.com/test.wav'
  return { lyric: '[00:00.00]桌面测试歌词' }
})
lx.request('https://api.example.com/ping', { headers: { Cookie: 'secret', Authorization: 'secret', 'music-holo-token': 'secret' } }, (error, response) => {
  if (error || response.statusCode !== 200 || response.body.ready !== true) throw new Error('网络桥或 JSON 适配失败')
  lx.send(lx.EVENT_NAMES.inited, { sources: { local: { name: '测试直链', type: 'music', qualitys: [], actions: ['musicUrl', 'lyric'] } } })
})`
    await page.getByTestId('custom-source-file').setInputFiles({ name: 'desktop.js', mimeType: 'text/javascript', buffer: Buffer.from(script) })
    expect(await application.evaluate(() => globalThis.smokeRequests.length)).toBe(0)
    await page.getByRole('button', { name: '隔离兼容检测 桌面测试源' }).click()
    await page.getByRole('button', { name: '我信任并检测' }).click()
    const result = page.locator('.source-runtime-result')
    await expect(result).toContainText('初始化声明 1 个平台', { timeout: 20000 })
    await result.getByRole('button', { name: '打开试听台 桌面测试源' }).click()
    const audition = page.getByRole('dialog', { name: '隔离试听台 · 桌面测试源' })
    await expect(audition.getByLabel('试听曲库搜索')).toHaveCount(0)
    await audition.getByRole('textbox', { name: 'musicInfo JSON' }).fill(JSON.stringify({ title: '桌面测试曲目' }))
    await audition.getByRole('button', { name: '解析音频' }).click()
    await page.getByRole('button', { name: '我信任并解析' }).click()
    await page.getByRole('button', { name: '允许加载音频' }).click()
    await expect(audition.getByText('音频地址已解析')).toBeVisible()
    await audition.getByRole('button', { name: '交给全局播放器试听' }).click()
    await expect(page.locator('.player-bar .pb-title')).toHaveText('桌面测试曲目')
    const audio = page.locator('.player-bar audio').first()
    await expect(audio).toHaveAttribute('src', /^app:\/\/music-holo\/__source_media\//)
    await expect.poll(() => audio.evaluate((node) => node.readyState)).toBeGreaterThanOrEqual(2)
    const ticket = await audio.getAttribute('src')
    const range = await page.evaluate(async (url) => {
      const response = await fetch(url, { headers: { Range: 'bytes=0-43' } })
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
    }, ticket)
    expect(range).toEqual({ status: 206, bytes: 44 })
    const requests = await application.evaluate(() => globalThis.smokeRequests)
    expect(requests.some(({ url }) => url.endsWith('/test.wav'))).toBe(true)
    for (const { headers } of requests) {
      for (const name of ['cookie', 'authorization', 'music-holo-token']) expect(headers[name]).toBeUndefined()
    }
    expect(await page.evaluate(() => localStorage.getItem('mh_player'))).not.toContain('__source_media')
    // Native denial and private URL rejection must not reach even the mocked network.
    await application.evaluate(() => { globalThis.smokeDeny = true })
    const count = requests.length
    expect(await page.evaluate(async () => {
      const id = await musicHoloDesktop.openSourceSession('deny')
      try { await musicHoloDesktop.request(id, 'deny', 'https://denied.example.com', {}); return false }
      catch { return true } finally { await musicHoloDesktop.closeSourceSession(id) }
    })).toBe(true)
    expect(await application.evaluate(() => globalThis.smokeRequests.length)).toBe(count)
    expect(await page.evaluate(async () => {
      const iframe = document.createElement('iframe'); iframe.srcdoc = '<body>untrusted</body>'; iframe.setAttribute('sandbox', 'allow-scripts')
      document.body.appendChild(iframe)
      return await new Promise((resolve) => { iframe.onload = () => { try { resolve(typeof iframe.contentWindow.musicHoloDesktop === 'undefined') } catch { resolve(true) } finally { iframe.remove() } } })
    })).toBe(true)
    await page.reload(); await page.waitForURL('**/#/sources')
    expect(await page.evaluate(async (url) => (await fetch(url)).status, ticket)).toBe(404)
    await expect(page.locator('.source-card h3')).toHaveText(['桌面测试源'])
    expect(await application.evaluate(() => globalThis.smokeBackendRequests)).toEqual([])
    expect(errors).toEqual([])
    console.log('Desktop smoke passed: enforced Chromium sandbox, guest/no-backend, import, native bridge, media range, deny, reload revocation')
  } catch (error) {
    const url = page?.url() || '(no page)'
    console.error('Desktop smoke failed at:', url)
    await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {})
    // 把失败详情写进步骤摘要与注解：CI 日志体积大，定位时优先看这里。
    reportFailure(error, url, errors)
    throw error
  } finally {
    await application?.context().tracing.stop({ path: path.join(artifacts, 'trace.zip') }).catch(() => {})
    await application?.close()
    await rm(profile, { recursive: true, force: true })
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })

// Non-blocking CI journey: obtain a real track from a public platform chart,
// resolve it through the real Xinghai LX source, and wait for Electron's media
// element to decode/play it. The app backend remains absent; only an explicit
// source import/consent flow may access the allowlisted public hosts below.
const { createHash } = require('node:crypto')
const { mkdtemp, rm, mkdir, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { _electron: electron, expect } = require('../../music-holo-web/node_modules/@playwright/test')

const SOURCE_URL = 'https://zrcdy.dpdns.org/lx/xinghai-music-sourcev2.3.15.js'
const SOURCE_SHA256 = '807d6157e4fd7cdd05b8727efd73778b54a3b05a0b5e4c6bb28dedc0668e94e9'
const SOURCE_NAME = '星海音乐源'
const ALLOWED_HOSTS = new Set([
  'zrcdy.dpdns.org', 'yy.zddyr.top', 'music.163.com',
  'music-api.gdstudio.xyz', 'music.126.net', 'p2.music.126.net'
])
const HOST_SUFFIXES = ['.music.126.net']

function hostAllowed(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  return ALLOWED_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

async function downloadVerifiedSource() {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`星海公开脚本下载失败：HTTP ${response.status}`)
  const script = await response.text()
  const sha256 = createHash('sha256').update(script, 'utf8').digest('hex')
  if (sha256 !== SOURCE_SHA256) throw new Error(`星海脚本指纹不符：sha256=${sha256}`)
  return { script, sha256 }
}

async function main() {
  const artifacts = path.resolve(__dirname, '../test-results')
  await mkdir(artifacts, { recursive: true })
  const profile = await mkdtemp(path.join(tmpdir(), 'music-holo-live-source-'))
  const errors = []
  let application
  let page
  let stopUpdateDismissal = () => {}
  let outcome = 'INCOMPLETE'

  try {
    const { script, sha256 } = await downloadVerifiedSource()
    console.log(`LIVE_DESKTOP_STEP 已下载并核对真实星海脚本 sha256=${sha256}`)

    application = await electron.launch({
      executablePath: require('electron'),
      chromiumSandbox: true,
      args: [
        path.resolve(__dirname, '..'),
        `--user-data-dir=${profile}`,
        '--autoplay-policy=no-user-gesture-required'
      ],
      timeout: 30_000
    })

    await application.evaluate(({ BrowserWindow, dialog, net }) => {
      if (require('electron').app.commandLine.hasSwitch('no-sandbox')) {
        throw new Error('Live source journey requires Chromium sandbox')
      }
      const requireFromMain = process.mainModule.require.bind(process.mainModule)
      const http = requireFromMain('node:http')
      const https = requireFromMain('node:https')
      globalThis.liveSourceApprovals = []
      globalThis.liveSourceRequests = []
      globalThis.liveBackendRequests = []

      // CI auto-confirms only known public endpoints for this pinned source/chart
      // journey. Unknown hosts are denied; production user prompts remain intact.
      dialog.showMessageBox = async (_window, options = {}) => {
        const message = String(options.message || '')
        const urlText = message.match(/https?:\/\/[^\s]+/)?.[0] || ''
        let host = ''
        try { host = new URL(urlText).hostname } catch { /* Non-network UI dialog. */ }
        const isHostPrompt = options.title === '授权音源访问' || message.includes('请求访问 ')
        const permitted = !isHostPrompt || (host && (
          ['zrcdy.dpdns.org', 'yy.zddyr.top', 'music.163.com', 'music-api.gdstudio.xyz', 'p2.music.126.net'].includes(host) ||
          host === 'music.126.net' || host.endsWith('.music.126.net')
        ))
        globalThis.liveSourceApprovals.push({ title: String(options.title || ''), host, permitted })
        const buttons = Array.isArray(options.buttons) ? options.buttons : []
        const allowIndex = buttons.findIndex((button) => /仅本次允许|允许/.test(String(button)))
        const denyIndex = buttons.findIndex((button) => /拒绝|取消/.test(String(button)))
        return { response: permitted ? (allowIndex >= 0 ? allowIndex : 1) : (denyIndex >= 0 ? denyIndex : 0) }
      }

      // In guest/no-backend mode no API call is needed. Block and record any
      // renderer attempt to talk to a backend; public sources use the guarded
      // desktop source IPC bridge (node:https), never this backend net.fetch.
      const originalNetFetch = net.fetch.bind(net)
      net.fetch = (url, options) => {
        if (/^https?:/i.test(String(url))) {
          globalThis.liveBackendRequests.push(String(url))
          throw new Error('Live guest source journey must not call the Music Holo backend')
        }
        return originalNetFetch(url, options)
      }

      // Audit header NAMES only (never store request values). The main-process
      // transport must strip cookies, authorization, referrer and app tokens.
      const auditRequest = (protocol, args) => {
        let url = ''
        let options = args[0]
        try {
          if (args[0] instanceof URL) {
            url = args[0].href
            options = args[1]
          } else if (typeof args[0] === 'string') {
            url = new URL(args[0], `${protocol}//invalid.local`).href
            options = args[1]
          } else if (args[0] && typeof args[0] === 'object') {
            options = args[0]
            url = `${options.protocol || protocol}//${options.hostname || options.host || ''}${options.path || '/'}`
          }
        } catch { url = '(unparsed request)' }
        const headerNames = Object.keys(options?.headers || {}).map((name) => name.toLowerCase())
        globalThis.liveSourceRequests.push({ url, headerNames })
      }
      const originalHttpRequest = http.request
      const originalHttpsRequest = https.request
      http.request = function (...args) {
        auditRequest('http:', args)
        return Reflect.apply(originalHttpRequest, this, args)
      }
      https.request = function (...args) {
        auditRequest('https:', args)
        return Reflect.apply(originalHttpsRequest, this, args)
      }

      const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      if (!preferences.contextIsolation || !preferences.sandbox || preferences.nodeIntegration || !preferences.webSecurity) {
        throw new Error('Unsafe Electron renderer preferences')
      }
    })

    page = await application.firstWindow()
    await application.context().tracing.start({ screenshots: true, snapshots: true })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })
    await page.waitForURL('**/#/sources', { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: '本机音源工作台' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('mh_token'))).toBeNull()

    // This background helper only closes the script's update notification; it
    // never opens an external URL and never dismisses the user's consent prompts.
    stopUpdateDismissal = startUpdatePromptDismissal(page)

    await page.getByTestId('custom-source-file').setInputFiles({
      name: 'xinghai-music-sourcev2.3.15.js',
      mimeType: 'text/javascript',
      buffer: Buffer.from(script, 'utf8')
    })
    await expect(page.locator('.source-card h3')).toContainText([SOURCE_NAME], { timeout: 15_000 })

    // Explicit test-user consent to execute the downloaded, SHA-pinned script.
    await page.getByRole('button', { name: `隔离兼容检测 ${SOURCE_NAME}` }).click()
    await page.getByRole('button', { name: '我信任并检测' }).click()
    const compatibility = page.locator('.source-runtime-result')
    await expect(compatibility).toContainText('初始化声明 6 个平台', { timeout: 90_000 })
    console.log('LIVE_DESKTOP_STEP 已在隔离 Worker 中初始化真实脚本（声明 6 个平台）')

    await compatibility.getByRole('button', { name: `打开试听台 ${SOURCE_NAME}` }).click()
    const audition = page.getByRole('dialog', { name: `隔离试听台 · ${SOURCE_NAME}` })
    await expect(audition.getByLabel('选择自定义音源平台')).toBeVisible()

    // Select the same Netease provider declared by the script, then fetch a
    // genuine online Netease leaderboard and its actual song IDs via the host adapter.
    await selectOption(page, audition.locator('.source-audition-fields .el-select').nth(0), 'wy')
    const selectedPlatformText = await audition.locator('.source-audition-fields .el-select').nth(0).innerText()
    expect(selectedPlatformText).toContain('(wy)')
    const loadCharts = audition.getByRole('button', { name: '加载榜单' })
    await expect(loadCharts).toBeEnabled()
    await loadCharts.click()

    const chartSelect = audition.locator('.source-audition-chart-select')
    await expect(chartSelect).toBeVisible({ timeout: 30_000 })
    await selectFirstVisibleOption(page, chartSelect)
    const trackButtons = audition.locator('[aria-label="平台曲目结果"] button')
    await expect(trackButtons.first()).toBeVisible({ timeout: 60_000 })

    const trackCount = await trackButtons.count()
    const maxCandidates = Math.min(trackCount, 5)
    const failures = []
    let playedTrack = null
    let actualQuality = ''
    let mediaOrigin = ''
    let audio = null

    for (let index = 0; index < maxCandidates && !playedTrack; index += 1) {
      const trackButton = trackButtons.nth(index)
      const catalogLabel = (await trackButton.innerText()).trim()
      await trackButton.click()
      const musicInfoText = await audition.getByRole('textbox', { name: 'musicInfo JSON' }).inputValue()
      const musicInfo = JSON.parse(musicInfoText)
      const catalogTitle = String(musicInfo.name || musicInfo.title || '')
      const catalogSinger = String(musicInfo.singerName || musicInfo.singer || musicInfo.artist || '')
      expect(catalogTitle).not.toBe('')
      expect(catalogLabel).toContain(catalogTitle)
      if (catalogSinger) expect(catalogLabel).toContain(catalogSinger)
      expect(String(musicInfo.id || musicInfo.songmid || '')).not.toBe('')

      actualQuality = await selectQuality(page, audition, '320k')
      console.log(`LIVE_DESKTOP_STEP 在线榜单曲目 ${index + 1}/${maxCandidates}：${catalogLabel}；平台 ID ${musicInfo.id || musicInfo.songmid}；音质 ${actualQuality}`)

      const resolution = await resolveAndApproveMedia(page, audition, 90_000)
      if (!resolution.ready) {
        failures.push(`${catalogLabel}（ID=${musicInfo.id || musicInfo.songmid}）：${resolution.error}`)
        continue
      }
      playedTrack = {
        title: String(musicInfo.name || musicInfo.title),
        singer: String(musicInfo.singerName || musicInfo.singer || musicInfo.artist || ''),
        id: String(musicInfo.id || musicInfo.songmid),
        chartLabel: catalogLabel,
        musicInfo
      }
      mediaOrigin = resolution.mediaOrigin
      await audition.getByRole('button', { name: '交给全局播放器试听' }).click()
      audio = page.locator('.player-bar audio').first()
      await expect(page.locator('.player-bar .pb-title')).toHaveText(playedTrack.title, { timeout: 20_000 })
      await expect(audio).toHaveAttribute('src', /^app:\/\/music-holo\/__source_media\//, { timeout: 20_000 })
      await expect.poll(() => audio.evaluate((element) => element.currentTime), { timeout: 60_000 })
        .toBeGreaterThan(0)
      const state = await audio.evaluate((element) => ({
        currentTime: element.currentTime,
        paused: element.paused,
        readyState: element.readyState,
        error: element.error ? `${element.error.code}:${element.error.message}` : ''
      }))
      if (state.error) throw new Error(`播放器解码错误：${state.error}`)
      expect(state.paused, '真实媒体必须仍在播放').toBe(false)
      expect(state.readyState).toBeGreaterThanOrEqual(2)

      const audit = await application.evaluate(() => ({
        approvals: globalThis.liveSourceApprovals,
        requests: globalThis.liveSourceRequests,
        backend: globalThis.liveBackendRequests
      }))
      expect(audit.backend, '游客/无后端桌面路径不得调用 Music Holo 后端').toEqual([])
      expect(audit.approvals.length, '音源及媒体域名必须走原生逐域名授权').toBeGreaterThan(0)
      for (const item of audit.approvals.filter((approval) => approval.host)) {
        expect(item.permitted, `未授权的主机不应被自动允许：${item.host}`).toBe(true)
        expect(hostAllowed(item.host), `出现未列入本次测试范围的公网主机：${item.host}`).toBe(true)
      }
      for (const request of audit.requests) {
        expect(hostAllowed(new URL(request.url).hostname), `出站请求不应访问未列入本次测试范围的主机：${request.url}`).toBe(true)
        for (const forbidden of ['cookie', 'cookie2', 'authorization', 'proxy-authorization', 'referer', 'music-holo-token']) {
          expect(request.headerNames).not.toContain(forbidden)
        }
      }

      outcome = `PLAYED 平台排行榜「${playedTrack.chartLabel}」 → 星海自定义源 → ${playedTrack.title} / ${playedTrack.singer} ` +
        `(platform=wy, id=${playedTrack.id}, quality=${actualQuality}, media=${new URL(mediaOrigin).host}, ` +
        `currentTime=${state.currentTime.toFixed(2)}s, paused=${state.paused}, readyState=${state.readyState})`
      console.log(`LIVE_DESKTOP_OUTCOME=${outcome}`)
    }

    if (!playedTrack) {
      throw new Error(`榜单前 ${maxCandidates} 首均未能由星海源播放：${failures.join('；')}`)
    }
    expect(errors, '页面不应有未处理的渲染进程错误').toEqual([])
  } catch (error) {
    outcome = `ERROR ${String(error?.message || error).replace(/\\s+/g, ' ').slice(0, 500)}`
    console.log(`LIVE_DESKTOP_OUTCOME=${outcome}`)
    try {
      await page?.screenshot({ path: path.join(artifacts, 'live-source-failure.png') })
      await writeFile(path.join(artifacts, 'live-source-failure.txt'), `${outcome}\n${error?.stack || error}\n`)
    } catch { /* keep original failure */ }
    throw error
  } finally {
    stopUpdateDismissal()
    await application?.context().tracing.stop({ path: path.join(artifacts, 'live-source-trace.zip') }).catch(() => {})
    await application?.close()
    await rm(profile, { recursive: true, force: true })
    if (outcome !== 'INCOMPLETE') console.log(`LIVE_DESKTOP_FINAL=${outcome}`)
  }
}

async function selectOption(page, select, matchingText) {
  await select.click()
  const options = page.locator('.el-select-dropdown__item:visible')
  await expect(options.first()).toBeVisible({ timeout: 15_000 })
  const count = await options.count()
  let selected = null
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    const label = (await option.innerText()).trim()
    if (label.includes(matchingText)) { selected = option; break }
  }
  if (!selected) throw new Error(`下拉选项中找不到「${matchingText}」`)
  const label = (await selected.innerText()).trim()
  const active = page.locator('.el-select-dropdown__item.is-selected:visible').first()
  if ((await active.innerText().catch(() => '')).trim() === label) {
    await page.keyboard.press('Escape')
    return label
  }
  await selected.click()
  return label
}

async function selectFirstVisibleOption(page, select) {
  await select.click()
  const first = page.locator('.el-select-dropdown__item:visible').first()
  await expect(first).toBeVisible({ timeout: 15_000 })
  const label = (await first.innerText()).trim()
  await first.click()
  return label
}

async function selectQuality(page, audition, desired) {
  const select = audition.locator('.source-audition-fields .el-select').nth(1)
  await select.click()
  const options = page.locator('.el-select-dropdown__item:visible')
  await expect(options.first()).toBeVisible({ timeout: 15_000 })
  const labels = (await options.allInnerTexts()).map((text) => text.trim())
  const quality = labels.includes(desired) ? desired : labels[0]
  const active = page.locator('.el-select-dropdown__item.is-selected:visible').first()
  if ((await active.innerText().catch(() => '')).trim() !== quality) {
    await page.getByRole('option', { name: quality, exact: true }).first().click()
  } else {
    await page.keyboard.press('Escape')
  }
  return quality
}

async function resolveAndApproveMedia(page, audition, timeoutMs) {
  await audition.getByRole('button', { name: '解析音频' }).click()
  await page.getByRole('button', { name: '我信任并解析' }).click()
  const deadline = Date.now() + timeoutMs
  let lastMessage = ''
  while (Date.now() < deadline) {
    const allowMedia = page.getByRole('button', { name: '允许加载音频' }).first()
    if (await allowMedia.isVisible().catch(() => false)) {
      await allowMedia.click({ timeout: 10_000 })
      const ready = audition.locator('.source-audition-ready')
      await expect(ready).toContainText('音频地址已解析', { timeout: 20_000 })
      const text = await ready.innerText()
      const mediaOrigin = text.match(/媒体域名：([^\s]+)/)?.[1] || ''
      if (!mediaOrigin) throw new Error(`已解析媒体地址，但状态没有媒体域名：${text}`)
      return { ready: true, mediaOrigin }
    }
    const messages = await page.locator('.el-message').allInnerTexts().catch(() => [])
    const warning = messages.map((message) => message.trim()).find((message) => /解析失败|没有返回|网络请求|超时|不安全|拒绝|错误|无法/.test(message))
    if (warning) lastMessage = warning.replace(/\\s+/g, ' ').slice(0, 240)
    await page.waitForTimeout(200)
  }
  return { ready: false, error: lastMessage || `等待媒体确认超时（${timeoutMs}ms）` }
}

function startUpdatePromptDismissal(page) {
  let running = true
  const task = (async () => {
    while (running) {
      const button = page.getByRole('button', { name: '稍后处理' }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 1_000 }).catch(() => {})
      } else {
        await page.waitForTimeout(100).catch(() => {})
      }
    }
  })()
  return () => { running = false; task.catch(() => {}) }
}

main().catch((error) => {
  console.error('Live custom-source playback failed:', error?.stack || error)
  process.exitCode = 1
})

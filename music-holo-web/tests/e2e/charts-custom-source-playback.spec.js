import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

/**
 * 排行榜（全站热歌榜）→ 自定义源播放的完整旅程。
 *
 * 与 custom-source-playback.spec.js 的区别：那条走的是搜索结果，这条走榜单，
 * 并且额外断言「真的在播」——把媒体地址接到仓库里真实的 public/audio/song1.wav 上，
 * 于是浏览器会真的解码、currentTime 会真的往前走（无声环境里能验到的最强证据）。
 *
 * 无头 Chromium 默认拦自动播放，而自定义源解析是异步的（Worker 往返 + 两次确认），
 * 到真正 play() 时用户手势早已过期，所以这条旅程显式放开自动播放策略。
 * 音源本身仍是受控夹具：验证的是宿主这条链路，不是第三方平台的可用性。
 */
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

test('榜单曲目可通过自定义源播放，并且进度真的前进', async ({ page }) => {
  const sourceScript = `/**
 * @name 榜单流程测试源
 * @version 1.0.0
 * @author Music Holo QA
 */
const lx = globalThis.lx
lx.on(lx.EVENT_NAMES.request, ({ action, info }) => {
  if (!info?.musicInfo?.title) throw new Error('缺少公开曲目信息')
  if (action === 'musicUrl') {
    if (info.musicInfo.songmid !== 'chart-song-42') throw new Error('平台曲目 ID 没有传给音源')
    if (info.type !== '320k') throw new Error('音质选择没有传给音源')
    return Promise.resolve({ url: 'https://media.example.org/chart-track.wav?quality=320k' })
  }
  if (action === 'lyric') return Promise.resolve({ lyric: '[00:00.00]榜单自定义源歌词' })
  if (action === 'pic') return Promise.resolve({ url: 'https://media.example.org/cover.png' })
  throw new Error('未知动作')
})
lx.send(lx.EVENT_NAMES.inited, { sources: {
  kw: { name: '兼容平台', type: 'music', actions: ['musicUrl', 'lyric', 'pic'], qualitys: ['128k', '320k'] }
} })`
  const source = {
    id: 'source-e2e-charts',
    hash: 'e2e-charts',
    fileName: 'e2e-charts.js',
    name: '榜单流程测试源',
    version: '1.0.0',
    description: '受控 E2E 音源（榜单）',
    author: 'Music Holo QA',
    homepage: 'https://example.org/e2e',
    importedAt: new Date().toISOString(),
    script: sourceScript
  }
  const testAudio = await readFile(new URL('../../public/audio/song1.wav', import.meta.url))
  const coverPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2BcAAAAASUVORK5CYII=', 'base64')
  let audioHeaders = null

  await page.goto('/')
  await page.evaluate((savedSource) => {
    localStorage.setItem('mh_custom_sources_v1:local', JSON.stringify([savedSource]))
  }, source)
  await page.route('https://media.example.org/chart-track.wav?quality=320k', async (route) => {
    audioHeaders = route.request().headers()
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/wav' },
      body: testAudio
    })
  })
  await page.route('https://media.example.org/cover.png', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' },
      body: coverPng
    })
  })

  // 榜单页：取第一行（按播放量排序，种子数据里是《霓虹海》）
  await page.goto('/charts')
  const firstRow = page.locator('.el-table__row').first()
  await expect(firstRow).toBeVisible()
  // 标题从按钮的 aria-label 里取，保证和后续对话框的名字完全对得上
  const sourceButton = firstRow.locator('[data-testid^="custom-source-play-"]')
  const buttonLabel = await sourceButton.getAttribute('aria-label')
  const title = String(buttonLabel || '').replace(/^使用自定义源播放《/, '').replace(/》$/, '')
  expect(title).not.toBe('')

  await sourceButton.click()
  const playbackDialog = page.getByRole('dialog', { name: `自定义源解析 · ${title}` })
  await expect(playbackDialog.locator('.source-playback-source .el-select')).toContainText('榜单流程测试源')
  await playbackDialog.getByRole('textbox', { name: '平台专属曲目字段 JSON' }).fill('{"songmid":"chart-song-42"}')
  await playbackDialog.getByRole('button', { name: '信任并初始化自定义音源' }).click()
  await page.getByRole('button', { name: '我信任并继续' }).click()
  await expect(playbackDialog.getByLabel('选择自定义音源平台')).toBeVisible()

  await playbackDialog.locator('.source-playback-fields .el-select').nth(1).click()
  await page.getByRole('option', { name: '320k' }).click()
  await playbackDialog.getByRole('button', { name: '隔离解析并播放歌曲' }).click()
  await page.getByRole('button', { name: '允许并播放' }).click()

  // 播放器切到这首，媒体元素指向自定义源返回的地址，且以匿名 CORS 取流
  await expect(page.locator('.player-bar .pb-title')).toHaveText(title)
  const customAudio = page.locator('.player-bar audio').first()
  await expect(customAudio).toHaveAttribute('crossorigin', 'anonymous')
  await expect(customAudio).toHaveAttribute('referrerpolicy', 'no-referrer')
  await expect(customAudio).toHaveAttribute('src', 'https://media.example.org/chart-track.wav?quality=320k')

  // 真的在播：浏览器解码仓库里的 wav，进度条时间会往前走
  await expect.poll(() => customAudio.evaluate((audio) => audio.currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await expect.poll(() => customAudio.evaluate((audio) => audio.paused)).toBe(false)

  await expect.poll(() => audioHeaders).not.toBeNull()
  expect(audioHeaders).not.toHaveProperty('cookie')
  expect(audioHeaders).not.toHaveProperty('authorization')

  // 自定义源的一次性地址不落盘、不进持久队列
  const persistedPlayer = await page.evaluate(() => JSON.parse(localStorage.getItem('mh_player') || '{}'))
  expect(JSON.stringify(persistedPlayer)).not.toContain('media.example.org')
})
